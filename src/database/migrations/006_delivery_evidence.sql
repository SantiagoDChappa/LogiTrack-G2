CREATE TABLE "logitrack"."deliveryEvidence" (
    "id" SERIAL PRIMARY KEY,
    "shipmentId" INT NOT NULL,
    "receiverName" VARCHAR NOT NULL,
    "receiverLastname" VARCHAR NOT NULL,
    "receiverDni" VARCHAR NOT NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);