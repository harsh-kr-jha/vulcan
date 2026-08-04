# Mock project upload pack

Upload these sources in order for the same active factory:

1. `project_master_mock.xlsx` as **Project master**
2. `project_stages_mock.xlsx` as **Project stages**

The pack contains six linked customer projects and 54 manufacturing-stage rows. It covers not
started, in-progress, delayed and completed execution, four priority levels, multiple owners,
planned and actual dates, notes, delays and attachment references.

The data is fictional and intended only for local demonstration and testing. Regenerate both
workbooks with:

```bash
.venv/bin/python test-data/projects/generate_workbooks.py
```
