DROP SCHEMA IF EXISTS "logitrack" CASCADE;
CREATE SCHEMA "logitrack";

-- ============================================================
-- Tablas
-- ============================================================

CREATE TABLE "logitrack"."user" (
    "id"       SERIAL,
    "fullName" varchar NOT NULL,
    "email"    varchar NOT NULL UNIQUE,
    "password" varchar NOT NULL,
    "document" int NOT NULL UNIQUE,
    "roleId"   int NOT NULL,
    "isActive" boolean DEFAULT true,
    PRIMARY KEY ("id")
);

CREATE TABLE "logitrack"."shipment" (
    "id"             SERIAL,
    "trackingId"     varchar NOT NULL UNIQUE,
    "statusId"       int NOT NULL,
    "createdAt"      timestamp NOT NULL DEFAULT NOW(),
    "senderId"       int NOT NULL,
    "recipientId"    int NOT NULL,
    "addressId"      int NOT NULL,
    "shipmentTypeId" int NOT NULL,
    "weightKg"       decimal(8,2) NOT NULL CHECK ("weightKg" > 0),
    "packageQty"     int NOT NULL CHECK ("packageQty" > 0),
    "deliveryUserId" int,
    PRIMARY KEY ("id")
);

CREATE TABLE "logitrack"."status" (
    "id"          int NOT NULL,
    "description" varchar NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "logitrack"."person" (
    "id"           SERIAL,
    "fullName"     text NOT NULL,
    "document"     int NOT NULL,
    "phone"        varchar,
    "email"        varchar,
    PRIMARY KEY ("id")
);

CREATE TABLE "logitrack"."province" (
    "id"          int     NOT NULL,
    "description" varchar NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "logitrack"."address" (
    "id"             SERIAL,
    "street"         varchar NOT NULL,
    "number"         int     NOT NULL,
    "provinceId"     int     NOT NULL,
    "postalCode"     varchar NOT NULL,
    "floorApartment" varchar,
    "lat"            float,
    "lng"            float,
    PRIMARY KEY ("id")
);

CREATE TABLE "logitrack"."roleType" (
    "id"          int NOT NULL,
    "description" varchar NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "logitrack"."shipmentType" (
    "id"          int NOT NULL,
    "description" varchar NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "logitrack"."shipment_history" (
    "id"           SERIAL,
    "shipmentId"   int       NOT NULL,
    "fromStatusId" int,
    "toStatusId"   int       NOT NULL,
    "comment"      text,
    "changedAt"    timestamp NOT NULL DEFAULT NOW(),
    "userId"       int,
    "eventType"    varchar   NOT NULL DEFAULT 'STATUS_CHANGE',
    PRIMARY KEY ("id")
);

CREATE TABLE "logitrack"."settings" (
    "key"   varchar PRIMARY KEY,
    "value" text
);

CREATE TABLE "logitrack"."notification_config" (
    "id"             SERIAL,
    "eventId"         int     NOT NULL,
    "enabled"      boolean DEFAULT false  NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "logitrack"."notification_events" (
    "id"          int     NOT NULL,
    "code"        varchar NOT NULL UNIQUE,
    "description" varchar NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "logitrack"."email_template" (
    "id"          int    NOT NULL,
    "eventId"     int     NOT NULL,
    "subject"     varchar NOT NULL,
    "body"        text    NOT NULL,
    PRIMARY KEY ("id")
);

-- ============================================================
-- FK
-- ============================================================
ALTER TABLE "logitrack"."email_template"
    ADD CONSTRAINT "fk_email_template_eventId"
    FOREIGN KEY ("eventId") REFERENCES "logitrack"."notification_events" ("id");

ALTER TABLE "logitrack"."notification_config"
    ADD CONSTRAINT "fk_notification_eventId"
    FOREIGN KEY ("eventId") REFERENCES "logitrack"."notification_events" ("id");
    
ALTER TABLE "logitrack"."address"
    ADD CONSTRAINT "fk_address_provinceId_province_id"
    FOREIGN KEY ("provinceId") REFERENCES "logitrack"."province" ("id");

ALTER TABLE "logitrack"."user"
    ADD CONSTRAINT "fk_user_roleId_roleType_id"
    FOREIGN KEY ("roleId") REFERENCES "logitrack"."roleType" ("id");

ALTER TABLE "logitrack"."shipment"
    ADD CONSTRAINT "fk_shipment_statusId_status_id"
    FOREIGN KEY ("statusId") REFERENCES "logitrack"."status" ("id");

ALTER TABLE "logitrack"."shipment"
    ADD CONSTRAINT "fk_shipment_senderId_person_id"
    FOREIGN KEY ("senderId") REFERENCES "logitrack"."person" ("id");

ALTER TABLE "logitrack"."shipment"
    ADD CONSTRAINT "fk_shipment_recipientId_person_id"
    FOREIGN KEY ("recipientId") REFERENCES "logitrack"."person" ("id");

ALTER TABLE "logitrack"."shipment"
    ADD CONSTRAINT "fk_shipment_addressId_address_id"
    FOREIGN KEY ("addressId") REFERENCES "logitrack"."address" ("id");

ALTER TABLE "logitrack"."shipment"
    ADD CONSTRAINT "fk_shipment_shipmentTypeId_shipmentType_id"
    FOREIGN KEY ("shipmentTypeId") REFERENCES "logitrack"."shipmentType" ("id");

ALTER TABLE "logitrack"."shipment"
    ADD CONSTRAINT "fk_shipment_deliveryUserId"
    FOREIGN KEY ("deliveryUserId") REFERENCES "logitrack"."user" ("id");

ALTER TABLE "logitrack"."shipment_history"
    ADD CONSTRAINT "fk_history_shipmentId"
    FOREIGN KEY ("shipmentId") REFERENCES "logitrack"."shipment" ("id");

ALTER TABLE "logitrack"."shipment_history"
    ADD CONSTRAINT "fk_history_fromStatusId"
    FOREIGN KEY ("fromStatusId") REFERENCES "logitrack"."status" ("id");

ALTER TABLE "logitrack"."shipment_history"
    ADD CONSTRAINT "fk_history_toStatusId"
    FOREIGN KEY ("toStatusId") REFERENCES "logitrack"."status" ("id");

ALTER TABLE "logitrack"."shipment_history"
    ADD CONSTRAINT "fk_history_userId"
    FOREIGN KEY ("userId") REFERENCES "logitrack"."user" ("id");
