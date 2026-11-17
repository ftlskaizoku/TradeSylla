# Firebase setup for TradeSylla

TradeSylla now uses Firebase Authentication and Cloud Firestore. Supabase is no longer a runtime dependency. Vercel remains the app host.

1. In Firebase Console, select the Firebase project that will host TradeSylla and register a **Web app**. Enable Email/Password, Google, and Microsoft under Authentication providers.
2. Create a Cloud Firestore database. Deploy the included rules and indexes with `firebase deploy --only firestore:rules,firestore:indexes --project YOUR_FIREBASE_PROJECT_ID` (or paste `firestore.rules` into the Firebase Console Rules tab and create the index in the Console).
3. Copy the Web app configuration into the `VITE_FIREBASE_*` variables from `.env.example` in local `.env` and in Vercel's Production, Preview, and Development environments.
4. Create a Firebase service account for the Vercel serverless functions. Set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` in Vercel. Store the private key with its PEM newlines preserved or as `\\n` sequences.
5. Set the same Firebase Admin variables for local Vercel development, along with the existing Stripe variables if payments are enabled.

The browser stores user data at `users/{firebaseUid}/{collection}/{documentId}`. Firestore rules restrict each user to their own records. Shared market candles and symbol metadata are read-only to signed-in users; the Vercel endpoints write them with the Admin SDK.

## Existing Supabase data and accounts

New Firebase signups work after Firebase configuration is supplied. Local browser data is copied into Firestore at first sign-in. Cloud data and accounts from the frozen Supabase project are not automatically transferred: an export from Supabase is required to import those records. Firebase passwords cannot be recovered from the browser; users whose accounts are not imported with supported password hashes will need to create a Firebase account and reset their password. Existing MT5/API tokens should be regenerated after accounts are recreated.
