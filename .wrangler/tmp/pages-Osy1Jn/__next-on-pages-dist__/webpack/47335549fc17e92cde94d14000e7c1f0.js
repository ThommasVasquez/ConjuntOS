var u={},N=(k,b,M)=>(u.__chunk_1223=()=>{},u.__chunk_9179=(_,S,v)=>{"use strict";var x=Object.create,s=Object.defineProperty,y=Object.getOwnPropertyDescriptor,i=Object.getOwnPropertyNames,O=Object.getPrototypeOf,j=Object.prototype.hasOwnProperty,c=(e,t,o,n)=>{if(t&&typeof t=="object"||typeof t=="function")for(let r of i(t))j.call(e,r)||r===o||s(e,r,{get:()=>t[r],enumerable:!(n=y(t,r))||n.enumerable});return e},w=((e,t)=>function(){return t||(0,e[i(e)[0]])((t={exports:{}}).exports,t),t.exports})({"../../node_modules/dedent-tabs/dist/dedent-tabs.js"(e){Object.defineProperty(e,"__esModule",{value:!0}),e.default=function(t){for(var o=typeof t=="string"?[t]:t.raw,n="",r=0;r<o.length;r++)if(n+=o[r].replace(/\\\n[ \t]*/g,"").replace(/\\`/g,"`").replace(/\\\$/g,"$").replace(/\\\{/g,"{"),r<(1>=arguments.length?0:arguments.length-1)){var P=n.substring(n.lastIndexOf(`
`)+1).match(/^(\s*)\S?/);n+=((1>r+1||arguments.length<=r+1?void 0:arguments[r+1])+"").replace(/\n/g,`
`+P[1])}var g=n.split(`
`),a=null;if(g.forEach(function(l){var R=Math.min,h=l.match(/^(\s+)\S+/);if(h){var m=h[1].length;a=a?R(a,m):m}}),a!==null){var C=a;n=g.map(function(l){return l[0]===" "||l[0]==="	"?l.slice(C):l}).join(`
`)}return n.trim().replace(/\\n/g,`
`)}}}),d={};((e,t)=>{for(var o in t)s(e,o,{get:t[o],enumerable:!0})})(d,{getOptionalRequestContext:()=>f,getRequestContext:()=>E}),_.exports=c(s({},"__esModule",{value:!0}),d),v(1223);var p=((e,t,o)=>(o=e!=null?x(O(e)):{},c(!t&&e&&e.__esModule?o:s(o,"default",{value:e,enumerable:!0}),e)))(w()),q=Symbol.for("__cloudflare-request-context__");function f(){let e=b[q];if((process?.release?.name==="node"?"nodejs":"edge")=="nodejs")throw Error(p.default`
			\`getRequestContext\` and \`getOptionalRequestContext\` can only be run
			inside the edge runtime, so please make sure to have included
			\`export const runtime = 'edge'\` in all the routes using such functions
			(regardless of whether they are used directly or indirectly through imports).
		`);return e}function E(){let e=f();if(!e)throw process?.env?.NEXT_PHASE==="phase-production-build"?Error(p.default`
				\n\`getRequestContext\` is being called at the top level of a route file, this is not supported
				for more details see https://developers.cloudflare.com/pages/framework-guides/nextjs/ssr/troubleshooting/#top-level-getrequestcontext \n
			`):Error("Failed to retrieve the Cloudflare request context.");return e}},u);export{N as __getNamedExports};
