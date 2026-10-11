# TODO

## Errors noticed in game play

- the last commit did not consolidate pause/stop for snippets/agent - this should be seamless, we do not need so two buttons
- when opening the game in browser for the first time, the query param is not populated with the current play, thus no snapshots are listed in load, use the first entry in the play dir for the game
- using magic when zing has no mp left (should return tool call error)
- selecting fire sometimes selects the wrong spell slot, it does not seem consistent which one

## UI changes

- move snippets tab before agents
- make markdown tab show (each as accordians, multi-display)
    - agent goals/memories/journal
    - prompt files
    - prompt groups and parts
- from the UI, the user should be able to CRUD the prompt markdown as well as change the group contents/order
