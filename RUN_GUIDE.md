# The File Room — Firm Operations Console Execution & Test Guide

This document explains how to correctly run the Firm Operations Console frontend and the Firebase backend locally without port collisions or browser URL errors.

---

## 1. Running the Firm Operations Console Locally

Run your preferred local static server:

```powershell
cd "C:\Users\user\Desktop\firm"
python -m http.server 5501 --bind 127.0.0.1
```
* **Landing Page:** [`http://127.0.0.1:5501/index.html`](http://127.0.0.1:5501/index.html)
* **Practitioner Sign In:** [`http://127.0.0.1:5501/login.html`](http://127.0.0.1:5501/login.html)
* **Operations Dashboard:** [`http://127.0.0.1:5501/dashboard.html`](http://127.0.0.1:5501/dashboard.html)
*(Or open with VS Code / Antigravity Live Server on port 5502)*

---

## 3. Running with Firebase Emulator Suite (Optional)

> [!NOTE]
> The emulator is **not required** to open the portals or run the 118 Node tests.
> Skip this section unless you want to test security rules locally.

### Prerequisites (one-time, free)
The emulator needs two tools that are **not currently installed** on this machine:

1. **Java 11 or newer** (the Firestore emulator runs on Java).
   - This machine already has Java 25 bundled with Android Studio, but it is not on PATH.
     Run this in each new PowerShell window before starting the emulator:
     ```powershell
     $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
     $env:Path = "$env:JAVA_HOME\bin;$env:Path"
     java -version
     ```
   - To make it permanent (run once, then open a **new** PowerShell window):
     ```powershell
     [Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Android\Android Studio\jbr", "User")
     $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
     [Environment]::SetEnvironmentVariable("Path", "C:\Program Files\Android\Android Studio\jbr\bin;$userPath", "User")
     ```
2. **Firebase CLI**:
   ```powershell
   npm install -g firebase-tools
   firebase --version
   ```
   - If `npm install -g` fails with `ENOENT ... AppData\Roaming\npm`, create the folder first:
     `mkdir "$env:APPDATA\npm"`
   - Alternative with no global install: prefix commands with `npx firebase-tools` instead of `firebase`.

> [!WARNING]
> PowerShell's suggestion to type `.\firebase` is misleading. `.\firebase` is a **folder**
> in this project, not the Firebase CLI.

### Start the emulator
```powershell
cd "C:\Users\user\Desktop\firm"
firebase emulators:start --only firestore
# or, without a global install:
npx firebase-tools emulators:start --only firestore
```
* **Firestore Emulator:** `127.0.0.1:8080`
* **Emulator UI Dashboard:** [`http://localhost:4000`](http://localhost:4000)

> [!IMPORTANT]
> The browser portals do **not** connect to the emulator automatically. `js/firebase.js`
> has no `connectFirestoreEmulator` call, so the portals always talk to the **live**
> `uk-client-d90d5` project. Use synthetic test accounts only.

---

## 4. Running the Automated Tests

All 118 security and integration tests are passing and can be executed via:

```powershell
# Run all 118 test cases across the entire test suite
cd "C:\Users\user\Desktop\firm"
node --test tests/*.test.js

# Run the 14-criterion Master Pre-Production Verification Suite
node --test tests/final-production-integration.test.js

# Run Cloud Functions tests (24 tests)
cd "C:\Users\user\Desktop\firm\functions"
npm test
```

---

## 5. Summary of Correct URLs

| Application | Correct Browser URL | DO NOT USE |
|---|---|---|
| **Client Portal** | `http://localhost:5500/client/login.html` | ~~`http://[::]:5500/`~~ |
| **Firm Operations Console** | `http://localhost:5501/login.html` | ~~`http://[::]:5501/`~~ |
| **Emulator Dashboard** | `http://localhost:4000` | ~~`http://[::]:4000/`~~ |
