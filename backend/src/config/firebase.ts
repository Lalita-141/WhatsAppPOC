import admin from "firebase-admin";
import fs from "fs";
import path from "path";

let isFirebaseInitialized = false;

export const initializeFirebase = () => {
    if (isFirebaseInitialized) {
        return admin;
    }

    try {
        // 1. Try explicit service account JSON path from env
        const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
        if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
            const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
            isFirebaseInitialized = true;
            console.log("Firebase Admin initialized using FIREBASE_SERVICE_ACCOUNT_PATH");
            return admin;
        }

        // 2. Try raw JSON string from env
        const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        if (serviceAccountJson) {
            const serviceAccount = JSON.parse(serviceAccountJson);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
            isFirebaseInitialized = true;
            console.log("Firebase Admin initialized using FIREBASE_SERVICE_ACCOUNT_JSON");
            return admin;
        }

        // 3. Try default local file in current directory or backend directory
        const possiblePaths = [
            path.resolve(process.cwd(), "serviceAccountKey.json"),
            path.resolve(process.cwd(), "backend", "serviceAccountKey.json"),
        ];

        for (const candidatePath of possiblePaths) {
            if (fs.existsSync(candidatePath)) {
                const serviceAccount = JSON.parse(fs.readFileSync(candidatePath, "utf-8"));
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                });
                isFirebaseInitialized = true;
                console.log(`Firebase Admin initialized using cert from: ${candidatePath}`);
                return admin;
            }
        }

        // 4. Fallback to Google Application Default Credentials
        admin.initializeApp({
            projectId: "hntwhatsapppoc",
        });
        isFirebaseInitialized = true;
        console.log("Firebase Admin initialized with default projectId: hntwhatsapppoc");
        return admin;
    } catch (error) {
        console.warn("Failed to initialize Firebase Admin SDK:", error);
        return null;
    }
};

export const getFirebaseAdmin = () => {
    if (!isFirebaseInitialized) {
        return initializeFirebase();
    }
    return admin;
};
