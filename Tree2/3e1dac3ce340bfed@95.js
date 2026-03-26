function _1(md){return(
md`<div style="color: grey; font: 13px/25.5px var(--sans-serif); text-transform: uppercase;"><h1 style="display: none;">Plot: Tree, tidy (JSON)</h1><a href="/plot">Observable Plot</a> › <a href="/@observablehq/plot-gallery">Gallery</a></div>

# Tidy tree, JSON

This variant of the [tidy tree](/@observablehq/plot-tree-tidy) accepts data given as a hierarchy — an object with children objects. This function converts is into the format expected by the tree mark: a flat list of paths separated by a common delimiter.`
)}

function _flare(FileAttachment){return(
FileAttachment("flare.json").json()
)}

function _3(Plot,d3,flare){return(
Plot.plot({
  axis: null,
  margin: 10,
  marginLeft: 40,
  marginRight: 160,
  width: 928,
  height: 1800,
  marks: [
    Plot.tree(d3.hierarchy(flare).leaves(), {
      path: (node) => node.ancestors().reverse().map(({ data: { name } }) => name).join("|"),
      delimiter: "|"
    })
  ]
})
)}

export default function define(runtime, observer) {
  const main = runtime.module();
  function toString() { return this.url; }
  const fileAttachments = new Map([
    ["flare.json", {url: new URL("./files/320319adbe9bc55f48decd5ac50240eb20a281129a3bf74dddec2e06cc751f75332ed152518f30160e9764e5aaf3343df10987252d7a41c1e912681dd7d1530d.json", import.meta.url), mimeType: "application/json", toString}]
  ]);
  main.builtin("FileAttachment", runtime.fileAttachments(name => fileAttachments.get(name)));
  main.variable(observer()).define(["md"], _1);
  main.variable(observer("flare")).define("flare", ["FileAttachment"], _flare);
  main.variable(observer()).define(["Plot","d3","flare"], _3);
  return main;
}
