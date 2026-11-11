import {z} from "zod";
const count=z.number().int().nonnegative(),address=z.string().regex(/^0x[0-9a-f]{40}$/),digest=z.string().regex(/^[0-9a-f]{64}$/);
const scalar=(s:string)=>Array.from(s).every(c=>{const n=c.codePointAt(0)!;return n<0xd800||n>0xdfff;});
const raw=z.string().regex(/^(?:0|[1-9]\d{0,77})$/);
const assetRow=z.tuple([count,raw,raw,count,count,count,count,count]);
const unresolvedRow=z.tuple([count,raw,raw]);
const totals=z.tuple([count,count,count,count,count,count,z.array(assetRow).max(10000),z.array(unresolvedRow).max(10000)]);
const productRow=z.tuple([count,totals]);
const day=z.tuple([count,count,digest,digest,count,count,count,count,count,count,count,count,z.string().regex(/^0x[0-9a-f]{64}$/),count,totals,z.array(productRow).max(10000)]);
const packedSchema=z.object({
 schema:z.literal("pulse-kong-envio/v4"),encoding:z.literal("dictionary-tuples/v1"),
 assetDictionary:z.array(z.object({chainId:count,address,symbol:z.string().min(1).max(128).refine(scalar),decimals:count.max(36)})).max(10000),
 productDictionary:z.array(z.object({chainId:count,address,name:z.string().max(512).refine(scalar)})).max(10000),
 history:z.array(day).max(2190),
});
export type PackedCapital=z.infer<typeof packedSchema>;
export const MAX_CAPITAL_REFERENCES=100000;
function compareScalar(a:string,b:string){
 const x=Array.from(a,c=>c.codePointAt(0)!),y=Array.from(b,c=>c.codePointAt(0)!);
 for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return x[i]-y[i];
 return x.length-y.length;
}
function ordered<T>(rows:T[],compare:(a:T,b:T)=>number){
 for(let i=1;i<rows.length;i++)if(compare(rows[i-1],rows[i])>=0)throw new Error("Capital dictionary is not strictly canonical.");
}
function checkRawBounds(value:object){
 const input=value as Record<string,unknown>;let references=0;
 const array=(v:unknown,max:number):unknown[]=>{if(!Array.isArray(v)||v.length>max)throw new Error("Invalid packed capital array bound.");return v;};
 array(input.assetDictionary,10000);array(input.productDictionary,10000);
 const add=(n:number)=>{references+=n;if(references>MAX_CAPITAL_REFERENCES)throw new Error("Packed capital expansion exceeds its reference limit.");};
 const total=(v:unknown)=>{const t=array(v,8);if(t.length!==8)throw new Error("Invalid capital totals tuple.");add(array(t[6],10000).length+array(t[7],10000).length);};
 for(const value of array(input.history,2190)){
  const d=array(value,16);if(d.length!==16)throw new Error("Invalid capital day tuple.");
  total(d[14]);const products=array(d[15],10000);add(products.length);
  for(const value of products){const p=array(value,2);if(p.length!==2)throw new Error("Invalid capital product tuple.");total(p[1]);}
 }
}
export function readPackedCapital(value:unknown):PackedCapital|null{
 if(!value||typeof value!=="object"||!("schema" in value)||value.schema!=="pulse-kong-envio/v4")return null;
 checkRawBounds(value);
 const p=packedSchema.parse(value);
 ordered(p.assetDictionary,(a,b)=>a.chainId-b.chainId||compareScalar(a.address,b.address)||compareScalar(a.symbol,b.symbol)||a.decimals-b.decimals);
 ordered(p.productDictionary,(a,b)=>a.chainId-b.chainId||compareScalar(a.address,b.address)||compareScalar(a.name,b.name));
 const usedAssets=new Set<number>(),usedProducts=new Set<number>();let references=0;
 const add=(n:number)=>{references+=n;if(references>MAX_CAPITAL_REFERENCES)throw new Error("Packed capital expansion exceeds its reference limit.");};
 const checkTotals=(t:z.infer<typeof totals>,chain:number)=>{
  add(t[6].length+t[7].length);
  for(const group of [t[6],t[7]]){
   const addresses=new Set<string>();
   for(const row of group){
    const asset=p.assetDictionary[row[0]];
    if(!asset||asset.chainId!==chain)throw new Error("Invalid capital asset reference.");
    if(addresses.has(asset.address))throw new Error("Duplicate or aliased capital asset reference.");
    addresses.add(asset.address);usedAssets.add(row[0]);
   }
  }
 };
 for(const d of p.history){
  checkTotals(d[14],d[0]);add(d[15].length);const addresses=new Set<string>();
  for(const row of d[15]){
   const product=p.productDictionary[row[0]];
   if(!product||product.chainId!==d[0])throw new Error("Invalid capital product reference.");
   if(addresses.has(product.address))throw new Error("Duplicate or aliased capital product reference.");
   addresses.add(product.address);usedProducts.add(row[0]);checkTotals(row[1],d[0]);
  }
 }
 if(usedAssets.size!==p.assetDictionary.length||usedProducts.size!==p.productDictionary.length)throw new Error("Capital dictionary contains unused entries.");
 return p;
}
function display(value:bigint,decimals:number){
 const sign=value<0n?"-":"",digits=(value<0n?-value:value).toString().padStart(decimals+1,"0");
 if(!decimals)return sign+digits;
 const fraction=digits.slice(-decimals).replace(/0+$/,"");
 return sign+digits.slice(0,-decimals)+(fraction?"."+fraction:"");
}
/** Only expand after every dictionary, reference, count and chain has passed preflight. */
export function decodePackedCapital(p:PackedCapital){
 const base=(index:number,deposits:string,withdrawals:string)=>{
  const {chainId,...asset}=p.assetDictionary[index];
  return {chainId,asset,depositsRaw:deposits,withdrawalsRaw:withdrawals,deposits:display(BigInt(deposits),asset.decimals),withdrawals:display(BigInt(withdrawals),asset.decimals)};
 };
 const expandTotals=(t:z.infer<typeof totals>)=>({
  depositingChainAddresses:t[0],withdrawingChainAddresses:t[1],unresolvedEvents:t[2],protocolEvents:t[3],internalEvents:t[4],migrationLegs:t[5],usd:null,
  assets:t[6].map(a=>({...base(a[0],a[1],a[2]),net:display(BigInt(a[1])-BigInt(a[2]),p.assetDictionary[a[0]].decimals),depositActions:a[3],withdrawalActions:a[4],depositingAccounts:a[5],withdrawingAccounts:a[6],actionsWithoutAccount:a[7]})),
  unresolvedAssets:t[7].map(a=>base(a[0],a[1],a[2])),
 });
 return p.history.map(d=>({
  chainId:d[0],day:d[1],accountingSha256:d[2],sourceSha256:d[3],registryProducts:d[4],nativeEventIneligibleProducts:d[5],metadataGapProducts:d[6],registryObservedAt:d[7],scopedEvents:d[8],transactions:d[9],
  anchor:{number:d[10],timestamp:d[11],hash:d[12]},...(d[13]?{receiptRecoveredEvents:d[13]}:{}),totals:expandTotals(d[14]),
  products:d[15].map(row=>({address:p.productDictionary[row[0]].address,name:p.productDictionary[row[0]].name,totals:expandTotals(row[1])})),
 }));
}
