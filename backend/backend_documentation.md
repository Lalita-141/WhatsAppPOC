# Backend Architecture Documentation

This document provides a comprehensive overview of the backend system, explaining how the server works, how the database is connected, the schema structure, and the responsibilities of each layer (Routes, Controllers, Validations, Services, and Repositories) across all modules.

---

## 1. How the Server Works

The server is built using **Node.js** with **Express.js** and uses **Socket.IO** for real-time bidirectional communication.

*   **`server.ts`**: This is the entry point of the application. It initializes the HTTP server using the Express `app`, sets up Socket.IO (`initializeSocket(httpServer)`), and starts listening on a specified port (default `5000`) and host (`0.0.0.0`).
*   **`app.ts`**: This file configures the Express application. It sets up essential middlewares like `cors` (for Cross-Origin Resource Sharing), `helmet` (for security headers), and JSON body parsing. It also maps all the module routes under the `/api/v1` prefix (e.g., `/api/v1/auth`, `/api/v1/user`, `/api/v1/chat`). It concludes by adding an `errorMiddleware` to catch and format API errors globally.
*   **`socket/socket.server.ts`**: Handles the Socket.IO initialization and connections, attaching to the main HTTP server to support features like real-time chat.

---

## 2. Database Connection & Schema

### Database Connection
The database connection is managed via **Prisma ORM**.
*   **`config/database.ts`**: The application connects to a MariaDB database using `@prisma/adapter-mariadb`. It uses environment variables (`DATABASE_HOST`, `DATABASE_USER`, etc.) to create a connection pool. A `PrismaClient` instance is exported and used by the Repositories to query the database.

### Database Schema (`schema.prisma`)
The schema defines several interconnected models to support an enterprise chat platform:
*   **Users & Organizations:** `user_master` stores basic user details (phone, name). `organization_master` stores company details. `user_organization` is the junction table linking a user to an organization with a specific role.
*   **Authentication:** `register_otp` handles OTP-based login and registration.
*   **Messaging:** 
    *   `personal_chat_history` stores one-to-one messages between users within organizations.
    *   `group_chat`, `wp_group`, `group_member`, and `group_chat_view` handle group definitions, memberships, messages, and read receipts.
*   **Settings:** `user_setting` manages privacy preferences (about, profile, last seen, read receipts).
*   **Location:** `country_master` manages supported countries and country codes.

---

## 3. Architecture Flow (Layered Pattern)

The application follows a standard layered architecture:
1.  **Routes (`.route.ts`)**: Defines the API endpoints (URLs) and HTTP methods (GET, POST). It attaches middlewares (like `authenticate`) and maps the route to a Controller.
2.  **Validations (`.validation.ts`)**: Defines TypeScript interfaces and validation functions (e.g., checking if an OTP is 4 digits, or a mobile number is valid). Controllers call these functions before processing requests.
3.  **Controllers (`.controller.ts`)**: Handles the HTTP request and response. It extracts data from `req.body` or `req.params`, runs validation, calls the appropriate Service function, and sends the formatted JSON response back to the client.
4.  **Services (`.service.ts`)**: Contains the core business logic. It processes the data, applies business rules, and calls the Repository layer.
5.  **Repositories (`.repository.ts`)**: Interacts directly with the database using Prisma to perform CRUD operations.

---

## 4. Modules Breakdown

### 1. Auth Module (`/api/v1/auth`)
Handles OTP generation and verification for user authentication.

*   **Routes:**
    *   `POST /send-otp` -> `sendOtpController`
    *   `POST /verify-otp` -> `verifyOtpController`
    *   `GET /me` -> `getMeController` (Requires `authenticate` middleware)
*   **Validations (`auth.validation.ts`):** 
    *   `validateSendOtpRequest`: Checks `orgCode`, `countryId`, and validates `mobileNo` format (6-15 digits).
    *   `validateVerifyOtpRequest`: Similar to send OTP but also requires `otp` (must be exactly 4 digits).
*   **Controllers (`auth.controller.ts`):** 
    *   Validates the incoming request body using the validation functions.
    *   Calls `sendOtp` or `verifyOtp` services.
    *   Returns success or validation errors (`VALIDATION_ERROR`).
*   **Services (`auth.service.ts`):** 
    *   Interacts with SMS gateways and the database to create OTP records, expire old ones, and generate JWT tokens upon successful verification.

### 2. User Module (`/api/v1/user`)
Manages user profiles and setup.

*   **Routes:**
    *   `POST /profile` -> `profileSetupController`
    *   `GET /getProfile` -> `getMyProfileController` (Requires `authenticate`)
    *   `PUT /updateProfile` -> `updateProfileController` (Requires `authenticate`)
*   **Validations (`user.validation.ts`):**
    *   `validateProfileSetupRequest`: Validates mandatory fields (`firstName`, `mobileNo`, `orgCode`) and checks length limits (e.g., `firstName` max 100 characters).
    *   `validateProfileUpdateRequest`: Ensures only allowed fields (`first_name`, `last_name`, `about`) are passed and validates their types and lengths.
*   **Controllers (`user.controller.ts`):**
    *   Executes validations.
    *   Passes the validated payload and user identity to `user.service.ts`.
*   **Services (`user.service.ts`):**
    *   Handles creating or updating the `user_master` and `user_organization` records in the database.

### 3. Chat Module (`/api/v1/chat`)
Handles personal and group messaging.

*   **Routes & Flow:**
    *   Contains sub-modules like `/personal` and `/group`.
    *   For example, Personal Chat involves `GET /personal/:userOrganizationId/messages` which maps to `getPersonalChatHistoryController`.
*   **Controllers & Validations:**
    *   The controller validates URL parameters (e.g., ensuring `userOrganizationId` is a valid BigInt).
*   **Services (`personal.service.ts` / `chat.service.ts`):**
    *   Handles business logic like pagination (cursors), blocking rules, and sorting chat histories.
    *   Calls `personal.repository.ts` which uses Prisma to query `personal_chat_history`.

### 4. Country & Organization Modules
*   **Country (`/api/v1/country`)**: Provides endpoints to fetch country codes and dial codes needed for login/registration forms.
*   **Organization (`/api/v1/organization`)**: Manages the `organization_master` entities, allowing the system to handle multi-tenant workspaces where users belong to specific organizations.

---

## Summary of Data Flow
1. **Client** makes an HTTP request to an endpoint (e.g., `POST /api/v1/auth/send-otp`).
2. **`app.ts`** catches the route and directs it to `auth.route.ts`.
3. **`auth.route.ts`** passes the request to `sendOtpController` in `auth.controller.ts`.
4. The **Controller** calls `validateSendOtpRequest` from `auth.validation.ts`.
5. If valid, the **Controller** calls the `sendOtp()` function in `auth.service.ts`.
6. The **Service** executes the business logic and calls functions in `auth.repository.ts`.
7. The **Repository** uses `PrismaClient` to execute a SQL query on the **MariaDB Database**.
8. The result flows back up to the **Controller**, which sends an HTTP JSON response to the **Client**.
