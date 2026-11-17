/** Presentation-only chart bounds. No observation is rescaled or filled. */
export function chartScale(values:number[],zero=false,domain?:[number,number],integer=false) {
  if(domain)return {min:domain[0],max:domain[1],ticks:[domain[0],(domain[0]+domain[1])/2,domain[1]]};
  let low=values.length?Math.min(...values):0, high=values.length?Math.max(...values):1;
  if(zero){low=Math.min(0,low);high=Math.max(0,high);}
  if(low===high){if(low===0)high=1;else {const margin=Math.abs(low)*0.1;low-=margin;high+=margin;}}
  const raw=(high-low)/3;
  const magnitude=10**Math.floor(Math.log10(raw));
  const fraction=raw/magnitude;
  const step=Math.max(integer?1:0,([1,2,2.5,5,10].find(n=>n>=fraction)??10)*magnitude);
  const min=Math.floor(low/step)*step,max=Math.ceil(high/step)*step;
  const ticks=Array.from({length:Math.round((max-min)/step)+1},(_,i)=>Number((min+i*step).toPrecision(12)));
  return {min,max,ticks};
}
