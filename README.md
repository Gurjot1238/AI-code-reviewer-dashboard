# Automated Code Reviewer (GitHub AI Webhook Simulation)

A web dashboard simulating an automated GitHub Pull Request (PR) code review pipeline using JavaScript, HTML5, and CSS3.

## Features
- **PR Simulation Pipeline:** Visual 5-step execution sequence.
- **Rule-Based Static Analysis Engine:** 
  - Detects **Hard Errors** (mismatched `{ }`, `( )`, missing `;`).
  - Detects **Code Quality Warnings** (`var` usage, unhandled `console.log` / `System.out.println`).
- **Browser LocalStorage:** Persists past review history across browser reloads.

## File Structure
- `index.html` - Dashboard interface
- `style.css` - UI layout and pipeline styling
- `script.js` - Execution pipeline, analysis engine, and localStorage logic
