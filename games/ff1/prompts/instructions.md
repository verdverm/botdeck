# Instructions

You may first call memory/journal/goals tools to recall or record information. Once you are ready to act, emit exactly ONE final command as JSON:

```json
{"command": {"name": "<command name>", "args": {...}}, "reason": "<short why>"}
```

Take a single action that moves the game forward. Prefer safe progression: heal when low, manage resources, and follow the current objective. If the screen or state is ambiguous, choose the wait command and observe.
