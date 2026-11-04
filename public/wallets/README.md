# Wallet image provenance

These static images identify wallet choices and Ethereum. They add no runtime package dependency or remote image request. They do not authenticate a wallet provider.

Five SVGs were decoded without visual changes from the installed RainbowKit 2.2.11 distribution. The exact [published package version](https://www.npmjs.com/package/@rainbow-me/rainbowkit/v/2.2.11) contains the wallet and chain icon modules listed in provenance.json. The accompanying MIT notice is in LICENSE.rainbowkit.txt.

The Ambire icon is an unchanged public brand asset from the official Ambire brand repository. Its branding remains the property of its owner. The RainbowKit license does not cover it. The official provider metadata uses com.ambire.wallet. See the [pinned announcement source](https://github.com/AmbireTech/extension/blob/f1a3c390565f17a9727277b0c22db05b174aae77/src/common/modules/inpage/eip6963.ts).

File sources and SHA-256 hashes are recorded in provenance.json. All local SVGs were inspected for active content and external references. Render them as image elements. Never inject provider-supplied SVG markup into the document.

Unknown provider icons follow [EIP-6963 image rules](https://eips.ethereum.org/EIPS/eip-6963#imagesicons): accept bounded data images and render SVG only through an img element. A provider name or identifier does not prove its identity.
