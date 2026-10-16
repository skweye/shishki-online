# Project requirements

- Every new game mode must ship with its own themed background scene on both the home screen and the game screen. Respect reduced-motion preferences and pause background animations when the page is hidden.
- Games played on boards belong in the board-game selector. Other modes belong in the separate lower “Игры вне доски” section. Keep a single selected mode across both sections.
- New modes must support local and online play, server-validated actions, reconnection, rematches, and the existing profile/statistics flow. Add meaningful rules and online regression tests.
- Preserve Russian, English and Ukrainian interface translations for new game controls and rules.

- Every new user-facing action, game mode, animation and reward flow must include appropriate, distinct sound feedback where meaningful. Integrate it with the shared sound settings (mute, volume and sound pack); never autoplay before user interaction, suppress audio while the page is hidden, and clean up scheduled sounds and animations. Include sound behavior in relevant regression tests.
