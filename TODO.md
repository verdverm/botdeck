# TODO

## Priority

## Done

- commands need better filtering based on current state (eg. allowing goto while in a menu or allowing menu navigation while not in a menu)
- A* fails when an object is on a tile, such as an npc
- talk_to should use the A* to get to the person and then interact
- there should be a mode / way a human user can run commands and have then work as if it was the agent, so the user can simulate the agent and find reproducible bugs. Snippets already support command steps; the Manual agent command input in the Agent tab runs through the agent path and persists the step.

## Map changes

- how do we determine difference between field, forest, sand, etc...?

## Errors noticed in game play

battle:

- rias tried to use cure, it selected the wrong (empty) slot, we should know what spells are in which slots, yes? (zing did this with fire too, something is defintiely off here)
- rias tried to use cure on stu, and it got to pointing at him, but never completed, seems inconsistent
- we need a way to notice battle completion and then "a" button multiple times at the right intervals (gathering data about the result), not sure how leveling up appears yet
- "battling" pill is still showing up when it shouldn't, it seems like we really need to think about state management in the battle sequencing
- (enhancement) while in the "battling" phase, we need to record all the actions and order they happen in, including enemy, so we know which enemies used which moves to attack which party members

overworld:
- recent changes to macro cancellation broke overworld navigation
- stop/run/step do not work once macro is interrupted, has red error text and idle state, unrecoverable

general:

- navigation plan should not be shown if the curr/last command was not navigate