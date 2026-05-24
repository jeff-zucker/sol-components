export const mimeTypes = ['text/vnd.graphviz', 'text/x-dot'];
export const extensions = ['dot', 'gv'];
export const cmLang = null; // no dedicated CM lang — plain text

export const example =
`digraph CollaborationNetwork {
  rankdir=LR;
  graph [bgcolor=transparent, fontname="sans-serif"];
  node  [shape=ellipse, style=filled, fillcolor=lightblue, fontname="sans-serif"];
  edge  [fontname="sans-serif", fontsize=10];

  Amara   [label="Amara Okafor\\nLagos"];
  Priya   [label="Priya Sharma\\nMumbai"];
  Diego   [label="Diego Vargas\\nMexico City"];
  Nadia   [label="Nadia Bintang\\nJakarta"];
  Layla   [label="Layla Al-Hassan\\nAmman"];

  Amara -> Priya  [label="mentors"];
  Amara -> Diego  [label="co-leads"];
  Priya -> Nadia  [label="collaborates"];
  Layla -> Amara  [label="reviews"];
  Layla -> Priya  [label="reviews"];
  Diego -> Nadia  [label="reports to"];
}`;
