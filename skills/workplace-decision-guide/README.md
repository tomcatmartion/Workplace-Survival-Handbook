# 职场决策 skill（workplace-decision-guide）

让 AI 助手照《职场打工创业高性价比大全》回答具体问题：该不该签、值不值、怎么算、被裁了先做什么、能领哪笔钱、这么干犯不犯法。

它做的事只有一件：**先把相关条目从正文里查出来，再照书的算账方式排序回答**，每条注明出自第几节第几条。查不到就说查不到，不凭记忆编数字。

规则全在 [SKILL.md](SKILL.md) 里，两个工具共用同一个文件，不维护两份。

## 装到 Claude Code

在本仓库里开 Claude Code，不用装——`.claude/skills/workplace-decision-guide/` 已经指向这份规则。

想在任何目录下都能用，复制到个人 skill 目录：

```bash
mkdir -p ~/.claude/skills/workplace-decision-guide && curl -fsSL -o ~/.claude/skills/workplace-decision-guide/SKILL.md "https://raw.githubusercontent.com/tomcatmartion/Workplace-Survival-Handbook/main/skills/workplace-decision-guide/SKILL.md"
```

之后直接问「加班费按几倍算」「公司让我先签主动辞职，签不签」就会触发；也可以显式说「用 workplace-decision-guide 回答」。

## 装到 Codex

在本仓库里开 Codex，不用装——根目录的 `AGENTS.md` 已经把它指出来了。

想在任何目录下都能用，复制到 Codex 的个人 skill 目录 `~/.agents/skills`：

```bash
mkdir -p ~/.agents/skills/workplace-decision-guide && curl -fsSL -o ~/.agents/skills/workplace-decision-guide/SKILL.md "https://raw.githubusercontent.com/tomcatmartion/Workplace-Survival-Handbook/main/skills/workplace-decision-guide/SKILL.md"
```

之后直接问问题就会按描述自动触发，也可以输入 `$workplace-decision-guide` 显式调用。注意是 `$` 不是 `/`，新版 Codex 输入 `/workplace-decision-guide` 会报 `Unrecognized command`。没出现就重启一次 Codex。

## 装到 WorkBuddy

复制到用户级 skill 目录即可：

```bash
mkdir -p ~/.workbuddy/skills/workplace-decision-guide && cp skills/workplace-decision-guide/SKILL.md ~/.workbuddy/skills/workplace-decision-guide/SKILL.md
```

## 正文从哪来

本地有这个仓库就读本地的 `book/`；没有就现取：

```bash
git clone --depth 1 https://github.com/tomcatmartion/Workplace-Survival-Handbook.git "${TMPDIR:-/tmp}/wsh"
```

取不到网络就如实说取不到，不替代正文。

## 改动须知

SKILL.md 里不留任何会跟着正文漂的清单和数值：节的清单去读 README 的「这本书想回答的问题」表，性价比档的算法去读 `index.html` 里的 `COST_W` 和 `e.ratio` 两行。所以增删节、改档位规则都不用动这个目录。
