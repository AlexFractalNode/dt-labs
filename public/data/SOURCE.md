# Data sources

The data sets of DT Labs are small teaching examples. The course files themselves (notebook, textbook, slides,
course data sets) are not part of this repository.

## Worked examples

- **Speed** (4 cases; features `Grade`, `Bumpiness`, `Speed_Limit`; target `Speed`): the small categorical worked
  example of the course notebook (cell 102), re-typed as a table in `src/core/presets.ts`.
- **Eight cases** (8 cases; numeric features `a1`, `a2`; classes 5/3): the worked example of notebook cell 121,
  re-typed in `src/core/presets.ts`. It is used for the tie discussion (notebook cell 125).

Both are chosen worked examples for hand calculation, not measurements from a study.

## Weather (Play Tennis)

The 14-row weather table (`outlook`, `temperature`, `humidity`, `wind`; target `play`) follows Quinlan, J. R. (1986),
"Induction of Decision Trees", *Machine Learning* 1, 81–106. It is the classic Play-Tennis example.

The course file `sun.csv` differs from this table in one row: `rain / hot / normal / strong` carries the label `1`
there. DT Labs uses the table as published by Quinlan. If you want to work with the course file, load it in the
Split Workshop via CSV upload.

## Synthetic data

The generators `xor`, `moons`, `circles` and `diagonal` are own code (`src/core/generators.ts`). They take the
number of points, the noise and a seed and produce reproducible data in the browser; nothing is downloaded.
The golden tests do not use them but data exported from NumPy (`tests/golden/*.json`).

## CSV upload

Files loaded through the CSV upload are read locally in the browser and are never sent anywhere.
