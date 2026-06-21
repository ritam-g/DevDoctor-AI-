# DevDoctor AI Authentication Flow

This is how your authentication system should work from a high-level view.

---

## Overall Authentication Architecture

```mermaid
flowchart TD

A[User Opens Frontend] --> B{Authentication Method}

B -->|GitHub OAuth| C[Continue With GitHub]
B -->|Email Password| D[Register/Login Form]

%% GitHub Flow
C --> E[GitHub Authorization]
E --> F[Passport GitHub Strategy]
F --> G{User Exists?}

G -->|No| H[Create User]
G -->|Yes| I[Load User]

H --> J[Generate Access Token]
I --> J

J --> K[Generate Refresh Token]
K --> L[Hash Refresh Token]
L --> M[Store Hash In Database]

M --> N[Set HttpOnly Refresh Cookie]
N --> O[Return Access Token + User]

%% Email Flow
D --> P{Register or Login}

P -->|Register| Q[Validate User Data]
Q --> R[Hash Password]
R --> S[Create User]
S --> J

P -->|Login| T[Find User]
T --> U[Compare Password]
U --> V{Password Correct?}

V -->|No| W[Throw ApiError]
V -->|Yes| J
```

---

# What Happens During Login?

### GitHub Login

```mermaid
sequenceDiagram

participant User
participant Frontend
participant GitHub
participant Passport
participant AuthService
participant MongoDB

User->>Frontend: Click Continue With GitHub
Frontend->>GitHub: Redirect User
GitHub->>Passport: Return Profile

Passport->>AuthService: githubLogin(profile)

AuthService->>MongoDB: Find User By githubId

alt User Not Found
    AuthService->>MongoDB: Create User
end

AuthService->>AuthService: Generate Access Token
AuthService->>AuthService: Generate Refresh Token

AuthService->>MongoDB: Store Refresh Token Hash

Passport->>Frontend: Access Token + Cookie
```

### What this means

GitHub is doing the identity verification.

You are doing:

```text
Find User
Create User
Generate Tokens
Create Session
```

---

# Email Registration Flow

```mermaid
sequenceDiagram

participant User
participant Controller
participant AuthService
participant MongoDB

User->>Controller: Register Request

Controller->>AuthService: register()

AuthService->>MongoDB: Check Existing Email

alt Email Exists
    AuthService-->>Controller: Error
else New User
    AuthService->>AuthService: Hash Password
    AuthService->>MongoDB: Create User
end

AuthService->>AuthService: Generate Access Token
AuthService->>AuthService: Generate Refresh Token

AuthService->>MongoDB: Store Refresh Hash

Controller-->>User: Access Token + Cookie
```

---

# Email Login Flow

```mermaid
sequenceDiagram

participant User
participant Controller
participant AuthService
participant MongoDB

User->>Controller: Login

Controller->>AuthService: login()

AuthService->>MongoDB: Find User

AuthService->>AuthService: Compare Password

alt Invalid Password
    AuthService-->>Controller: ApiError
else Valid Password
    AuthService->>AuthService: Generate Tokens
    AuthService->>MongoDB: Save Refresh Hash
end

Controller-->>User: Access Token + Cookie
```

---

# Access Token Flow

The access token is used for every protected API request.

```mermaid
flowchart TD

A[Frontend API Request]
--> B[Authorization Bearer Token]

B --> C[Auth Middleware]

C --> D[Verify Access Token]

D --> E{Valid?}

E -->|No| F[401 Unauthorized]

E -->|Yes| G[Find User]

G --> H[req.user]

H --> I[Protected Controller]
```

Example:

```http
GET /api/repos
Authorization: Bearer eyJhbGc...
```

---

# Refresh Token Flow

This is the most important part.

```mermaid
flowchart TD

A[Access Token Expired]
--> B[Frontend Calls Refresh]

B --> C[Read Refresh Cookie]

C --> D[Verify JWT]

D --> E[Find User]

E --> F[Compare Refresh Hash]

F --> G{Valid?}

G -->|No| H[Reject Session]

G -->|Yes| I[Generate New Access Token]

I --> J[Generate New Refresh Token]

J --> K[Store New Hash]

K --> L[Set New Cookie]

L --> M[Return New Access Token]
```

This process is called:

```text
Refresh Token Rotation
```

---

# Logout Flow

```mermaid
flowchart TD

A[User Clicks Logout]

A --> B[Delete Refresh Hash From DB]

B --> C[Clear Cookie]

C --> D[Logout Success]
```

After logout:

```text
Old Refresh Token = Useless
Old Session = Invalid
```

---

# How Your Files Participate

```mermaid
flowchart LR

A[passport.ts]
--> B[auth.service.ts]

B --> C[jwt.ts]

B --> D[User.model.ts]

E[auth.controller.ts]
--> B

F[auth.routes.ts]
--> E

G[auth.middleware.ts]
--> C
```

---

# Current DevDoctor Authentication Lifecycle

```mermaid
flowchart TD

User[User]
--> Login[GitHub or Email Login]

Login
--> AccessToken[Access Token 15 Minutes]

Login
--> RefreshToken[Refresh Token 14 Days]

AccessToken
--> ProtectedRoutes[Protected APIs]

ProtectedRoutes
--> UploadRepository

UploadRepository
--> AIAnalysis

AIAnalysis
--> Reports

RefreshToken
--> RefreshEndpoint

RefreshEndpoint
--> NewAccessToken

Logout
--> SessionDestroyed
```

# After Authentication Is Complete

Your next major feature becomes:

```text
Repository Upload
        ↓
Cloudinary Storage
        ↓
Repository Model
        ↓
BullMQ Queue
        ↓
AI Analysis Agent
        ↓
Report Generation
```

So think of Authentication as the **gatekeeper**. Once the user gets through this flow, everything else in DevDoctor AI (uploading repositories, generating reports, AI fixes, discussions) depends on the authenticated user identity.
