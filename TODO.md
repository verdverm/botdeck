# TODO

## UI changes

- says "thinking" while battle moves are playing out, but not actually thinking (or calling llm based on gpu usage), we need another state "battling"
- consolidate snippets tab and move before agents, first agents, then user snippets
- make markdown tab show (each as accordians, multi-display)
    - agent goals/memories/journal
    - prompt files
    - prompt groups and parts
- from the UI, the user should be able to CRUD the prompt markdown as well as change the group contents/order
- we need a way to show templates / rendered versions based on the current state, perhaps a toggle so the rendered versions update with state updates?

## Map changes

- how do we determine difference between field, forest, sand, etc...?

## Errors noticed in game play

battle:

- rias tried to use cure on stu, and it got to pointing at him, but never completed, seems inconsistent
- we need a way to notice battle completion and then "a" button multiple times at the right intervals (gathering data about the result), not sure how leveling up appears yet

overworld:
- recent changes to macro cancellation broke overworld navigation
- stop/run/step do not work once macro is interrupted, has red error text and idle state, unrecoverable