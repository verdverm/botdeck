# TODO

## Priority

- navigation plan should not be shown if the curr/last command was not navigate

## Errors noticed in game play

battle:

- rias tried to use cure, it selected the wrong (empty) slot, we should know what spells are in which slots, yes? (zing did this with fire too, something is defintiely off here)
- rias tried to use cure on stu, and it got to pointing at him, but never completed, seems inconsistent
- we need a way to notice battle completion and then "a" button multiple times at the right intervals (gathering data about the result), not sure how leveling up appears yet
- "battling" pill is still showing up when it shouldn't, it seems like we really need to think about state management in the battle sequencing
- (enhancement) while in the "battling" phase, we need to record all the actions and order they happen in, including enemy, so we know which enemies used which moves to attack which party members
