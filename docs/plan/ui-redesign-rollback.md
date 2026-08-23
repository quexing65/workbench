# UI 改版回退操作手册

> 写给不常碰 git 的自己。**不用记命令，遇到情况来这查，按场景抄命令即可。**
> 最坏情况也有救（见场景五），不要慌。

> **2026-08-24 更新**：改版已验收合并进 main 并发布 v1.2.0。`ui-redesign` 分支
> 已完成使命（保留未删）；现在"回退改版"走 **场景二（已合并，用 `git revert
pre-ui-redesign..HEAD` 安全反向）**。`pre-ui-redesign` 标签仍是回到改版前的锚点。

## 你现在拥有什么

- **`main` 分支**：永远存放"改版前、可正常使用的版本"。改版代码不直接写在 main 上。
- **`ui-redesign` 分支**：所有改版提交都在这里做。
- **`pre-ui-redesign` 标签（tag）**：指向改版前最后一个提交（含计划文档，不含任何改版代码），是"回到过去"的锚点。名字比哈希好记，输错字母 git 会报错提示，不会误伤。

随时可跑的查看命令（只看不动，绝对安全）：

```bash
git status              # 有没有未提交的改动；第一行还显示当前分支
git branch              # 分支列表，带 * 号的是当前分支
git log --oneline -10   # 最近 10 条提交
git tag                 # 标签列表
```

## 场景一：改版还在 ui-redesign 分支上，不想要了

```bash
git checkout main
```

完成。main 上没有任何改版代码，应用就是旧版。之后想继续改也可以再
`git checkout ui-redesign` 切回去；确定永远不要了才删分支：

```bash
git branch -D ui-redesign
```

⚠️ 如果 `git checkout main` 报错 "would be overwritten"：说明手上有未提交的修改，
先存起来再切：

```bash
git stash -u
git checkout main
```

## 场景二：改版已经合并进 main，想整体回退

**先看推没推过 GitHub（`git status` 第一行会显示 ahead/落后信息），分两种：**

还没推送（本地领先 origin）——直接把 main 拉回锚点：

```bash
git checkout main
git reset --hard pre-ui-redesign
```

已经推送过了——改版经 --no-ff 合并进 main（合并提交 `b63bf00`），**一条命令反向整个合并**，
不改写历史，之后正常 push 即可：

```bash
git checkout main
git revert --no-edit -m 1 b63bf00
git push
```

说明：`-m 1` 表示沿着 main 这一侧反向，一次性抵消合并带来的全部改版代码。
注意不要用 `git revert pre-ui-redesign..HEAD`——范围里含合并提交，git 会因缺少
`-m` 参数直接报错。版本号 bump 与本手册的登记提交（`e9614f3`、`9f00526`）不含
改版代码，可留着不动；回退后若要恢复旧界面分发，需按台账流程再发一个补丁版。

（进阶可选：`git reset --hard pre-ui-redesign` + `git push --force-with-lease`
可以把远程历史也抹干净，但会改写远程记录，非必要不碰。）

## 场景三：只想撤销最近一次提交，不是全退

```bash
git revert HEAD
```

生成一条"反向提交"抵消最近一次改动，历史保留，最安全，推没推过都能用。

## 场景四：改乱了但还没提交，想放弃手上改动

```bash
git restore .           # 撤销已跟踪文件的修改
git clean -fd           # 删除新增的未跟踪文件/文件夹
```

⚠️ 这两条**不可逆**。执行前先 `git status` 看清楚要丢的是什么，
拿不准就先 `git stash -u`（存起来，日后 `git stash pop` 可取回）。

## 场景五：以上都不管用 / 误操作了

git 几乎总能自救。`git reflog` 记录你去过的每一个位置：

```bash
git reflog
```

找到出错前那条记录的哈希（形如 `a1b2c3d`），回到那里：

```bash
git reset --hard a1b2c3d
```

## 三条铁律

1. 拿不准时，**先跑 `git status` 和 `git log --oneline -10`**，把输出原样发给
   AI 助手问一句再动手，不要盲敲命令。
2. `reset --hard` 和 `clean -fd` 会**不可逆地丢改动**——执行前确认
   `git status` 里没有你还想要的东西。
3. 不要用 `git push --force`（含 `--force-with-lease`），除非明确知道后果。

## 回退后怎么确认成功

```bash
git log --oneline -5          # 应看到 pre-ui-redesign 附近的旧提交
npm run dev -w @workbench/web # 起前端，访问 http://127.0.0.1:5190 目测
```
