Make sure everything works with no errors before you present it to me. Take as long as you need — correctness over speed.

## Git workflow
After finishing a task, commit the changes with a clear message — automatically, without being asked. Never run `git push`; Tyson controls pushing and deploying himself. (A local PreToolUse hook in `.claude/settings.json` also blocks pushes as a backstop. If a deploy is needed, Tyson pushes it himself.)