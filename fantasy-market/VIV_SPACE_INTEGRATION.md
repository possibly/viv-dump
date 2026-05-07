# Viv Space Integration

The fantasy-market world runs generate snapshots in [viv-space](https://github.com/possibly/viv-space) format, enabling interactive chronicle visualization.

## Snapshot Format

Each run exports a JSON snapshot to `public/chronicle-seed{SEED}-scale{SCALE}-{DATE}.json` containing:
- **schemaVersion**: "0.10.2" (viv-space compatible)
- **timestamp**: final simulation timestamp
- **entities**: all characters, locations, items, and actions with full state
- **vivInternalState**: Viv's internal planner, action queues, embargo state

## Generating Snapshots

Run a world simulation:

```bash
FM_SCALE=full FM_DAYS=30 FM_SEED=100 npm start
```

This generates: `public/chronicle-seed100-scalefull-2026-05-07.json`

## Viewing Snapshots

1. Clone [viv-space](https://github.com/possibly/viv-space):
   ```bash
   git clone https://github.com/possibly/viv-space.git
   cd viv-space
   npm install
   ```

2. Replace `public/sample-chronicle.json` with your snapshot:
   ```bash
   cp /path/to/fantasy-market/public/chronicle-seed*.json viv-space/public/sample-chronicle.json
   ```

3. Run the visualizer:
   ```bash
   npm run dev
   ```

4. Open browser to `http://localhost:5173` (or port shown by `npm run dev`)

## Snapshot Contents

**Entities (characters, locations, items, actions):**
- Full state at end of simulation
- Action graph with causal chains (`causes`, `caused`, `ancestors`, `descendants`)
- Character memories (action references with salience and associations)
- Bindings and tags for action semantics

**Graph Visualization:**
- Nodes = actions, colored by initiator character
- Edges = causal relationships
- Filters by character, tag, time window
- Pan/zoom interactive navigation

## Notable Snapshots

### `chronicle-seed100-scalefull-2026-05-07.json` (13 MB)
- **Scale**: full (~500 NPCs, ~60 stalls)
- **Duration**: 30 in-game days (720 ticks)
- **Fire events**: Check sifting results in console output
- **Action count**: ~100K actions

### `chronicle-seed200-scalefull-2026-05-07.json` (TBD)
- Second full-scale run for comparison

## Tips

- **Large snapshots**: Full-scale runs (~500 NPCs) generate 10–15 MB snapshots; viv-space handles this well
- **Graph layout**: The force-directed layout takes a moment to stabilize on large graphs; wait 3–5 seconds
- **Filtering**: Use the character filter to focus on a single vendor's story
- **Tag search**: Filter by tags like `social`, `commerce`, `arson`, `revenge` to trace causal chains
- **Causal exploration**: Click a node to highlight its ancestors (what led to it) and descendants (what it caused)

## Troubleshooting

- **Snapshot not found**: Verify `npm start` printed "Exported snapshot to..." before quitting
- **Visualization hangs**: Close and re-open the browser; force-directed layout can be intensive on 100K+ actions
- **Memory issues**: Smaller scales (`phase-a`, `phase-b`) generate faster and use less RAM
