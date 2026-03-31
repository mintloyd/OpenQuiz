# Real-time Multiplayer Quiz Platform

A Kahoot-style, real-time multiplayer quiz game built with Node.js, Express, and WebSockets.

![Quiz Host Placeholder](https://via.placeholder.com/800x400.png?text=Quiz+Host+Dashboard)

## Features
- **Real-time Gameplay:** Instant synchronization between Host and Players via WebSockets.
- **Multiple Roles:**
  - **Host (`/`)**: Manages the game, controls the flow, and displays questions and leaderboards.
  - **Player (`/player.html`)**: Joins the game via a 6-digit code, answers questions on their device.
  - **Admin (`/admin.html`)**: Creates, configures, and deletes quizzes. Supports various question types (radio, checkbox, text) and image uploads.
- **i18n Support:** Fully translated in English (Default) and Russian. Switchable directly from the UI.
- **Game Mechanics:** Question timer, live scoreboard, dynamic podium for the top 3 players at the end.

## Quick Start

### 1. Installation
Clone the repository and install dependencies:
```bash
git clone <your-repo-url>
cd quiz
npm install
```

### 2. Configuration (`.env`)
By default, the server runs on port 3000. You can configure this and other settings using a `.env` file. Create a `.env` file in the root directory:
```env
PORT=3000
```

### 3. Data Setup
No quizzes are shipped by default. To start playing immediately:
```bash
cp quizzes.example.json quizzes.json
```
This gives you a sample quiz to test with. All future quizzes created via the Admin panel are saved to `quizzes.json`.

### 4. Running the App
```bash
npm start
```
The server will start at `http://localhost:3000`.

## Architecture & Structure
- `server.js`: Main Node.js backend handling Express routing and WebSocket events.
- `public/`: Static files (HTML, CSS, JS).
- `public/i18n.js` & `public/i18n/`: Client-side translation language files.
- `quizzes.json`: Automatic JSON file generated to store quiz states (ignored in git).
- `public/uploads/`: Directory for images attached to quiz questions (ignored in git).

## Localization Support (i18n)
The project supports Internationalization. To add a new language:
1. Create a `<lang-code>.json` inside `public/i18n/` based on `en.json`.
2. Add the language code to the `SUPPORTED_LANGUAGES` array in `public/i18n.js`.
3. Add a corresponding `🇬🇧 EN` style label in `createLangSwitcher()`.

## License
MIT License. Created by [mintloyd].
