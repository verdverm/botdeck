# TODO

## Map navigation

tasks: (not ordered)

1. create a "grind" command, like "goto" it is navigation, however it should be a coordinate+distance that the algorithm should randomly walk around until a battle is encountered
2. extract Corneria town/castle map, I expect the helper scripts and process should be reusable / similar for all towns/castles
3. update A* to handle these two prior, or perhaps A* just needs to go to the coordinate, then another "random walk" algorithm takes ove


## Errors noticed in game play

- using magic when zing has no mp left (should return tool call error)
- selecting fire sometimes selects the last spell (it's the first in the 0001_dev setup)