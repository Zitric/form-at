// Critical font-face + element-reset CSS, inlined into `<head>` by
// `__root.tsx` rather than loaded via a stylesheet link — avoids the extra
// round-trip for CSS that's needed before first paint.
export const fontCSS = `
@font-face{font-family:"Space Mono";font-style:normal;font-weight:400;font-display:block;src:url("/fonts/space-mono-400.woff2") format("woff2")}
@font-face{font-family:"Space Mono";font-style:normal;font-weight:700;font-display:block;src:url("/fonts/space-mono-700.woff2") format("woff2")}
@font-face{font-family:"Space Mono";font-style:italic;font-weight:400;font-display:block;src:url("/fonts/space-mono-400-italic.woff2") format("woff2")}
@font-face{font-family:"Bedstead";font-style:normal;font-weight:400;font-display:block;src:url("/fonts/bedstead.woff2") format("woff2")}
@font-face{font-family:"Bedstead Condensed";font-style:normal;font-weight:400;font-display:block;src:url("/fonts/bedstead-condensed.woff2") format("woff2")}
/* Element resets all in @layer base so Tailwind utilities (in @layer utilities)
   always win — utilities cascade in a later layer. Without the layer wrapping,
   unlayered element selectors would beat any utility class regardless of
   specificity, forcing ! on every override. The brand background/font on body
   still applies during the FOUC window because layered rules apply normally
   when no later-layer rule is loaded yet. */
@layer base {
  *,*::before,*::after{box-sizing:border-box}
  html{line-height:1.5;-webkit-text-size-adjust:100%}
  body{margin:0;font-family:"Space Mono",ui-monospace,monospace;background:#161615;color:#fff}
  h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit;margin:0}
  p{margin:0}
  ul,ol{list-style:none;margin:0;padding:0}
  li{margin:0}
  button,input{font-family:inherit;font-size:inherit}
  img{display:block;max-width:100%}
}
`.trim();
