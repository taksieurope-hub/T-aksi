import{c as t,u as g,j as e,D as u,g as f,B as r,h,i as m}from"./index-CeMHe7Wc.js";/**
 * @license lucide-react v0.428.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=t("Globe",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20",key:"13o1zl"}],["path",{d:"M2 12h20",key:"9i4pu4"}]]);/**
 * @license lucide-react v0.428.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=t("Share2",[["circle",{cx:"18",cy:"5",r:"3",key:"gq8acd"}],["circle",{cx:"6",cy:"12",r:"3",key:"w7nqdw"}],["circle",{cx:"18",cy:"19",r:"3",key:"1xt0gg"}],["line",{x1:"8.59",x2:"15.42",y1:"13.51",y2:"17.49",key:"47mynk"}],["line",{x1:"15.41",x2:"8.59",y1:"6.51",y2:"10.49",key:"1n3mei"}]]),l={ka:"🇬🇪",en:"🇺🇸",ru:"🇷🇺",hi:"🇮🇳",zh:"🇨🇳",nl:"🇳🇱",fr:"🇫🇷",de:"🇩🇪",pl:"🇵🇱",af:"🇿🇦",zu:"🇿🇦",xh:"🇿🇦"},b=({variant:c="default"})=>{const{language:s,setLanguage:o,languages:n,t:i}=g(),d=l[s]||"🌐";return e.jsxs(u,{children:[e.jsx(f,{asChild:!0,children:c==="default"?e.jsxs(r,{variant:"outline",size:"icon",className:"h-9 w-9 rounded-full p-0 border-[#00d4ff]/20 hover:bg-[#00d4ff]/10",children:[e.jsx("span",{className:"text-lg",children:d}),e.jsx("span",{className:"sr-only",children:i("select_language")})]}):e.jsxs(r,{variant:"ghost",className:"flex items-center gap-2 text-[#00ff88] hover:text-[#00d4ff]",children:[e.jsx(p,{className:"h-5 w-5"}),n[s]]})}),e.jsx(h,{align:"end",className:"w-48 bg-[#07070f]/95 backdrop-blur-md border border-[#00d4ff]/20 rounded-xl shadow-2xl",children:Object.entries(n).map(([a,x])=>e.jsxs(m,{onClick:()=>o(a),className:`flex items-center gap-2 px-4 py-2 text-sm font-medium cursor-pointer 
              ${s===a?"bg-[#00d4ff]/20 text-[#00ff88]":"text-white hover:bg-[#00d4ff]/10"}`,children:[e.jsx("span",{className:"mr-2",children:l[a]}),x,s===a&&e.jsx("span",{className:"ml-auto",children:"?"})]},a))})]})};export{p as G,b as L,j as S};
