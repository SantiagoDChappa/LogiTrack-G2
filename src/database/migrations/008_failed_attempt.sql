CREATE TABLE IF NOT EXISTS "logitrack"."failedAttempt" (
    "id" SERIAL PRIMARY KEY,
    "shipmentId" INT NOT NULL,
    "reason" VARCHAR NOT NULL,
    "attemptDate" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DECIMAL(10, 7),
    "longitude" DECIMAL(10, 7),
    "photoBase64" TEXT,
    "observation" TEXT,
    "suggestedDate" DATE,
    "rescheduledDate" DATE,
    "status" VARCHAR NOT NULL DEFAULT 'pendiente',
    "operatorId" INT,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);