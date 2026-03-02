# Some miscelaneous information

## Getting descriptive information

`python scripts/0.descriptive.py --lang finnish`

## Generating datasets via random sampling 

This came from a different experiment; my initial purpose is to compare active learning with random sampling to see whether the former is actually useful. Perhaps for language documentation purpose, when we do not have a lot of data, it might matter less whether we select data "informatively" via active learning. This is to be verified empirically (maybe not necessarily through this thesis project). The dataset size of each random sampling iteration matches that of active learning (e.g., `select_size`)

`python scripts/1.random_dataset.py --lang finnish`

## Doing active learning

Once you generate the random datasets, you will see, e.g.,

```
data/
└── finnish/                     # Language
    └── 100/                     # Initial training size to start active learning process (`initial_size`)
        └── 0/                   # Seed
            └── 50/              # The number of samples to select from each active learning iteration (`select_interval`)
                └── random/      # Sampling method
                    ├── select0/     # First AL iteration (e.g., 0 selected samples; training size would be the initial training size)
                    ├── select50/    # Second AL iteration (e.g., 0 + 50 selected samples = 50; training size would be initial training size + 50)
                    ├── select100/   # Third AL iteration (e.g., 0 + 50 + 50 selected samples = 100; training size would be initial training size + 100)
                    └── ...          # Continuous AL iterations until reaching maximum original data size
```

`python scripts/crf_al.py --lang finnish`

`python scripts/crf_al.py --lang finnish --select_size 50`
