# 0. next

- hook up to homelab little model
- create available actions, incorp into prompts
- take_action tool that should be the final tool call, this breaks the agent loop and runs macros
- macro system for game input, a* for navigation

# game state inspection - game playing automation loop

ideally, we will iterate over 1-3 in a self improving loop
- this will happen over multiple sessions or turns
- the user will give you the scope and area to work on per-message, stay focused on the most recent message more
- we will co-write subagent prompts and make commits along the way, you will know if this is the current task because it should be obvious based on the user's message and session history
- when you prompt subagents for this work, make sure you include a sentence about reading IDEAS.md so they have this same context

### 1. game state and info

1. change the game state viewer label text "game state" to "game info"
2. expand the component to use tabs
3. tabs: [overview,party,location,battle,agent,markdown]
    - overview should be the current content, both the current game info and the json viewer
    - party: show all detailed info for the party; sub tabs [main with important for all party members,one for each party member with full details]
    - location: world, town, cave, etc position information; a list of places that can be navigated to and their position (like when in a town)
    - fill battle,agent,markdown tabs with lorem ipsum like content
4. continue understanding and verifying game state, there seems to be an understanding of a lot of the shape, but we need more textual / interface representation

### 2. agent integration

1. render template into dynamic agent prompt
    - static ./prompts dir for both games and plays - dir of prompt snippets, each a template rendered
    - data / context for prompt rendering
      - game info in human readable (basically our calculated value from the snapshot state)
      - memory/journal/goals
    - options for prompt construction from play config, well want to control snippets of markdown (static&dynamic) and their order, default in game config file, play overrides, make it a list of prompt snippets
2. for the initial game integration
    - button for making agent step: [snapshot->assemble prompt/tools->call llm->take action]
    - show the agent prompt and response, these should be included in the snapshot directory, the entire agent interaction actually, keep saving at each agent response event, so we (in theory) do not lose an entire session if it dies in the middle or something
3. integrate agent chat into UI, make it a tab under the game state (we have this now, so maybe we just need a input box for user injecting messages?)
4. server vs client / both options / which used through what control?
    - want to stream game play live, youtube, but also webrtc too
    - also want users to be able to play themselves if they have local llms or api keys

### 3. agent tools

1. macro system so these can be changed without rebuilding the server, as json?
2. menu navigation
    - party settings / items / equipment change
    - stores
    - battles
3. query possible / walk to location (A* algo)
    - do we have map info about walkable vs not (mountains, water before getting boat)
    - can we get a list of all reachable points from current location?
    - maybe this is even in the game state so we don't have to determine on the query side?
4. (sub)agents - usable by main agent
    - specialized agents like battles, buying/upgrading equipment/
    - reflection/planning/historian/summarize
    - let the main agent eventually decide if/when to use/create these - depending on play
    - like tools, the agents exposed should be configure through/with the play, global defaults for the game if play doesn't set

5. hint/question tool
6. memory/journal/goals
    - files/dirs the agent uses through tools (not generic read/edit, still need CRUD, but more intentional/semantic)
    - goals: a single short (1k chars default)
    - memory: short-term/important/minimal (2k chars default)- always included, limited in count and size, cache-like
    - journal: long-term/for anything (32k default default)- record learnings about game, nested dir-like
    - these should be stored under the play dir as separate subdirs, metadata/config about them in the play config file


----

# other (later)

### docs / site

- cloudflare cli
- gaming.verdverm.ai
- words about
- user view-only / playable - webrtc for both


### ui refactor

- expand into pages
    - landing
    - botdeck
    - games / plays simpler browser, gear towards finding and loading
    - plays/snapshots browser / detailed / table with accordion rows?
    - evals / analysis
- botdeck specific
    - make game screen smaller, buttons to the left/right, less text
    - creative background / button style to look more like an actual game pad
    - refactor layout to be top-left game pad, bot-left current brief, rhs full height as we have now - eventually we want to primarily show the agent activities / messages / etc


### rom changing

- manipulate copy of rom
- if play has a rom, use that instead of the top-level / default / original
- create new ./games/ff1/alchemy package
- user interface

### games

- super nintendo, ff2 ; gameboy, pokemon; is there a better emulator for all systems in one? would like to stay TS
- ksp, but that will require significantly different approach (mod, actual game, not browser/emulator)
- versus, play games against an agent
- 4x, civ, x4 foundations

