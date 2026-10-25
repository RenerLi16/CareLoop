# Bedside interface preview

A separate, clickable proposal for three screens: patient home, medicine confirmation, and caregiver tools. All data is fictional and interactions remain in memory. It does not read or modify the working CareLoop record.

Run from the repository root:

```sh
python3 -m http.server 3001 --bind 127.0.0.1 --directory design
```

Open http://127.0.0.1:3001/. The controls above the tablet switch between mockup screens. Within the mockup, try Mark as taken, Save as taken, Undo, Change time, and For caregivers.

The proposal uses larger type and stronger emphasis for daily actions, with compact secondary text. Privacy details are behind a labelled button. Caregiver tools use four clearly named choices without explanatory paragraphs.

This is a design review, not an implementation change to the live app. Review the three screens before adapting the real care workflow, accessibility behavior, persistence, and tests.
