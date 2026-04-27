DROP SCHEMA IF EXISTS "logitrack" CASCADE;
CREATE SCHEMA "logitrack";

-- ============================================================
-- Tablas
-- ============================================================

CREATE TABLE "logitrack"."user" (
    "id"       SERIAL,
    "fullName" varchar,
    "email"    varchar,
    "password" varchar,
    "document" int,
    "roleId"   int,
    PRIMARY KEY ("id")
);

CREATE TABLE "logitrack"."shipment" (
    "id"             SERIAL,
    "trackingId"     varchar,
    "statusId"       int,
    "createdAt"      date,
    "senderId"       int,
    "recipientId"    int,
    "addressId"      int,
    "shipmentTypeId" int,
    "weightKg"       decimal(8,2),
    "packageQty"     int,
    PRIMARY KEY ("id")
);

CREATE TABLE "logitrack"."status" (
    "id"          int NOT NULL,
    "description" varchar,
    PRIMARY KEY ("id")
);

CREATE TABLE "logitrack"."person" (
    "id"           SERIAL,
    "fullName"     text,
    "document"     int,
    "phone"        varchar,
    "email"        varchar,
    "personTypeId" int,
    PRIMARY KEY ("id")
);

CREATE TABLE "logitrack"."province" (
    "id"          int     NOT NULL,
    "description" varchar NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "logitrack"."personType" (
    "id"          int NOT NULL,
    "description" varchar,
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
    "description" varchar,
    PRIMARY KEY ("id")
);

CREATE TABLE "logitrack"."shipmentType" (
    "id"          int NOT NULL,
    "description" varchar NOT NULL,
    PRIMARY KEY ("id")
);

-- ============================================================
-- FK
-- ============================================================

ALTER TABLE "logitrack"."address"
    ADD CONSTRAINT "fk_address_provinceId_province_id"
    FOREIGN KEY ("provinceId") REFERENCES "logitrack"."province" ("id");

ALTER TABLE "logitrack"."person"
    ADD CONSTRAINT "fk_person_personTypeId_personType_id"
    FOREIGN KEY ("personTypeId") REFERENCES "logitrack"."personType" ("id");

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

CREATE TABLE "logitrack"."shipment_history" (
    "id"           SERIAL,
    "shipmentId"   int       NOT NULL,
    "fromStatusId" int,
    "toStatusId"   int       NOT NULL,
    "comment"      text,
    "changedAt"    timestamp NOT NULL,
    "userId"       int,
    "eventType"    varchar   NOT NULL DEFAULT 'STATUS_CHANGE',
    PRIMARY KEY ("id")
);

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
