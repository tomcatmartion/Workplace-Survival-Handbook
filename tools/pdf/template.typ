// PDF 版面。只改这个文件，不要动 build.mjs 的转码逻辑。
#set document(title: "职场打工创业高性价比大全", author: "职场打工创业高性价比大全")
#set page(
  paper: "a4",
  margin: (top: 2.2cm, bottom: 2cm, x: 2cm),
  header: context {
    let h = query(selector(heading.where(level: 1)).before(here()))
    if h.len() > 0 {
      set text(size: 8.5pt, fill: rgb("#7b838c"))
      align(right, h.last().body)
    }
  },
  numbering: "1 / 1",
)
#set text(font: ("Songti SC", "SimSun", "Noto Serif CJK SC"), size: 10.5pt, lang: "zh", region: "cn")
#set heading(numbering: none)
#show heading.where(level: 1): it => {
  pagebreak(weak: true)
  set text(size: 17pt, weight: "bold")
  block(above: 0.6em, below: 0.8em, it.body)
}
#show heading.where(level: 2): it => {
  set text(size: 12pt, weight: "bold")
  block(above: 1.1em, below: 0.35em, it.body)
}
#set par(justify: true, leading: 0.85em, first-line-indent: 0pt)
#show link: it => underline(text(fill: rgb("#3451b2"), it))

#align(center)[
  #text(size: 22pt, weight: "bold")[职场打工创业高性价比大全]
  #v(0.6em)
  #text(size: 10.5pt, fill: rgb("#4a5158"))[用最少的钱、时间和精力，换回最多的收入、时间、健康余量和人身自由]
  #v(0.4em)
  #text(size: 9.5pt, fill: rgb("#7b838c"))[正文按 CC BY 4.0 发布 · github.com/tomcatmartion/Workplace-Survival-Handbook]
]

#outline(title: "目录", indent: auto, depth: 2)
#pagebreak()

$BODY$
