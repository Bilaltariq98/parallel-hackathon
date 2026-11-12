# 01 · Recon

Scripts that tested each idea against the Parallel API before anything was built: how fast the answers come back, how often they carry sources, and whether the results are interesting enough to build on.

- `recon.py`: first timings for the basic calls.
- `blast.py`: company and vendor pairs for Blast Radius. `blast_out.txt` is its summary.
- `webinator.py`: yes or no questions about companies for Webinator.
- `roomradar.py`: company attributes and pair comparisons for Room Radar.

Run any of them with `python3 01-recon/<name>.py`. They need a Parallel API key from `parallel-cli` sign-in. The raw response dumps are not in the repository; the scripts recreate them.
