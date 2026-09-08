import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1788876681110 implements MigrationInterface {
    name = 'InitialSchema1788876681110'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "inventories" ("id" SERIAL NOT NULL, "itemId" integer NOT NULL, "quantity" real NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7b1946392ffdcb50cfc6ac78c0e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "suppliers" ("id" SERIAL NOT NULL, "code" character varying NOT NULL, "name" character varying NOT NULL, "business_number" character varying, "contact_phone" character varying, "email" character varying, "address" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_6f01a03dcb1aa33822e19534cd6" UNIQUE ("code"), CONSTRAINT "PK_b70ac51766a9e3144f778cfe81e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "shipments" ("id" SERIAL NOT NULL, "shipment_number" character varying NOT NULL, "carrier_name" character varying, "tracking_number" character varying, "status" character varying NOT NULL DEFAULT 'SHIPPING', "estimated_arrival" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_09e68fb886b6834083d7275d5a5" UNIQUE ("shipment_number"), CONSTRAINT "PK_6deda4532ac542a93eab214b564" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "purchase_order" ("id" SERIAL NOT NULL, "itemId" integer NOT NULL, "quantity" integer NOT NULL, "unitPrice" numeric, "status" character varying NOT NULL DEFAULT 'PENDING', "supplierId" integer, "shipmentId" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ad3e1c7b862f4043b103a6c8c60" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "items" ("id" SERIAL NOT NULL, "code" character varying NOT NULL, "name" character varying NOT NULL, "type" character varying NOT NULL DEFAULT 'RAW_MATERIAL', "unit" character varying DEFAULT 'EA', "spec" character varying, "description" character varying, "vendor" character varying, "composition" character varying, "styleNo" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_1b0a705ce0dc5430c020a0ec31f" UNIQUE ("code"), CONSTRAINT "PK_ba5885359424c15ca6b9e79bcf6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "work_orders" ("id" SERIAL NOT NULL, "itemId" integer NOT NULL, "targetQuantity" real NOT NULL DEFAULT '1', "status" character varying NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_29f6c1884082ee6f535aed93660" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "work_order_size_spec_row" ("id" SERIAL NOT NULL, "part" character varying NOT NULL, "size" character varying NOT NULL, "instructedValue" character varying, "sampleValue" character varying, "diffValue" character varying, "finalValue" character varying, "specId" integer, CONSTRAINT "PK_66f5997d7d0d6be8a15029fc38f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "work_order_spec" ("id" SERIAL NOT NULL, "styleNo" character varying NOT NULL, "workNotes" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_bfa139e9b6c0456a62ffb1118b1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ai_usage_log" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "pageCount" integer NOT NULL, "promptTokens" integer NOT NULL, "outputTokens" integer NOT NULL, "estimatedCostUsd" numeric NOT NULL, "chargedAmountKrw" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b51c8fcf98a77ad8bef55c91bd5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "users" ("id" SERIAL NOT NULL, "username" character varying NOT NULL, "email" character varying, "password" character varying NOT NULL, "name" character varying, "role" character varying NOT NULL DEFAULT 'USER', "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username"), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "bom_item_details" ("id" SERIAL NOT NULL, "category" character varying NOT NULL, "colorCode" character varying NOT NULL, "spec" character varying NOT NULL, "consumption" numeric NOT NULL, "requiredQty" numeric NOT NULL, "supplier" character varying NOT NULL, "unitPrice" numeric NOT NULL, "remarks" character varying NOT NULL, "bomId" integer, "materialId" integer, CONSTRAINT "PK_70b0d1d7a62d645b906aa8c613c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "bom_master" ("id" SERIAL NOT NULL, "bomNo" character varying NOT NULL, "version" character varying NOT NULL, "styleStyleNo" character varying, CONSTRAINT "PK_533f0e0bdb3386253839658b0ec" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "master_style" ("styleNo" character varying NOT NULL, "overviewId" integer, CONSTRAINT "REL_f75e98d662d1fd5ec4be014e67" UNIQUE ("overviewId"), CONSTRAINT "PK_9e8439d75f43843a28a9ab61f0b" PRIMARY KEY ("styleNo"))`);
        await queryRunner.query(`CREATE TYPE "public"."style_overview_status_enum" AS ENUM('PENDING_APPROVAL', 'APPROVED')`);
        await queryRunner.query(`CREATE TABLE "style_overview" ("id" SERIAL NOT NULL, "factory" character varying NOT NULL, "totalQty" numeric NOT NULL, "buyer" character varying NOT NULL, "firstShipDate" TIMESTAMP, "status" "public"."style_overview_status_enum" NOT NULL DEFAULT 'PENDING_APPROVAL', "brand" character varying, "itemType" character varying, "productionType" character varying, "targetRdd" date, "cmtPrice" numeric, "fobPrice" numeric, "styleName" character varying, CONSTRAINT "PK_d883e11ecedffc40f01831c1119" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "contract" ("id" SERIAL NOT NULL, "styleNo" character varying NOT NULL, "issuedAt" TIMESTAMP NOT NULL DEFAULT now(), "notes" character varying, CONSTRAINT "PK_17c3a89f58a2997276084e706e8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "staging_parse_raw" ("id" SERIAL NOT NULL, "fileName" character varying NOT NULL, "raw_header_json" text, "raw_bom_json" text, "error_message" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7d07472108937353b4c34154515" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "mapping_rules" ("id" SERIAL NOT NULL, "rawKey" character varying NOT NULL, "standardKey" character varying NOT NULL, "targetEntityId" integer, "ruleType" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_9a3fbbf1ae88ea664ae4d7ae62f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "mapping_exception_logs" ("id" SERIAL NOT NULL, "batchId" integer NOT NULL, "sourceRowId" integer NOT NULL, "exceptionCode" character varying NOT NULL, "message" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6b2a983acae59e77a0dc649be45" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."import_file_status_enum" AS ENUM('SUCCESS', 'MISMATCH', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "import_file" ("id" SERIAL NOT NULL, "fileName" character varying NOT NULL, "styleNo" character varying NOT NULL, "importedAt" TIMESTAMP NOT NULL DEFAULT now(), "status" "public"."import_file_status_enum" NOT NULL DEFAULT 'SUCCESS', CONSTRAINT "PK_1c45e43598e6cde5b5934cfca7c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "tx_receiving" ("id" SERIAL NOT NULL, "receivingId" character varying NOT NULL, "shipmentBatch" character varying NOT NULL, "rcvdQty" numeric NOT NULL, "balanceQty" numeric NOT NULL, "traceabilityKey" character varying, "purchaseOrderId" integer, CONSTRAINT "UQ_9bb7df6cd5dae74f7aaa953a234" UNIQUE ("receivingId"), CONSTRAINT "PK_d192ce531070f77e8a489e7881d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "master_styles" ("id" SERIAL NOT NULL, "styleNo" character varying NOT NULL, "season" character varying NOT NULL, "year" integer NOT NULL, "rddDate" date, CONSTRAINT "PK_6c1fa3d0949c063848d7e84f86c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_ab88f38369365bf35606d740d1" ON "master_styles" ("styleNo") `);
        await queryRunner.query(`CREATE TABLE "master_materials" ("id" SERIAL NOT NULL, "itemCode" character varying NOT NULL, "itemName" character varying NOT NULL, "category" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'ACTIVE', CONSTRAINT "PK_2993781468bd98fbb7fc8991344" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_09b5a66f51de033d20ceeefa96" ON "master_materials" ("itemCode") `);
        await queryRunner.query(`CREATE TABLE "master_vendors" ("id" SERIAL NOT NULL, "vendorCode" character varying NOT NULL, "vendorName" character varying NOT NULL, CONSTRAINT "PK_ec9513bccbff90c8a77fd667290" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_7cb9b02bf0e58aba7a7039d5cd" ON "master_vendors" ("vendorCode") `);
        await queryRunner.query(`CREATE TABLE "master_buyers" ("id" SERIAL NOT NULL, "buyerCode" character varying NOT NULL, "buyerName" character varying NOT NULL, CONSTRAINT "PK_82b22e9239e5b39f368652678fe" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_2973142103004e0750cc3756f8" ON "master_buyers" ("buyerCode") `);
        await queryRunner.query(`CREATE TABLE "master_colors" ("id" SERIAL NOT NULL, "colorCode" character varying NOT NULL, CONSTRAINT "PK_4cb151b38cee636d3926f0e658f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_8ab288c4c31f58af4d99d1386d" ON "master_colors" ("colorCode") `);
        await queryRunner.query(`CREATE TABLE "master_sizes" ("id" SERIAL NOT NULL, "sizeCode" character varying NOT NULL, CONSTRAINT "PK_0ab5cd3f8ec82e5df5c919007df" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_f0556d750ef3e5d2007947cc4b" ON "master_sizes" ("sizeCode") `);
        await queryRunner.query(`ALTER TABLE "inventories" ADD CONSTRAINT "FK_dba77c53cc779a4c890647f6c74" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "purchase_order" ADD CONSTRAINT "FK_faea61bb23c7e8294b76ee8fb1d" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "purchase_order" ADD CONSTRAINT "FK_e4ea5841622429c12889a487f31" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "purchase_order" ADD CONSTRAINT "FK_e5857e1ca4b9649fdde6570691d" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "work_orders" ADD CONSTRAINT "FK_477f6f0dce71affd3e23e06537b" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "work_order_size_spec_row" ADD CONSTRAINT "FK_40b2a69017ba0776c6fc7a9e2fc" FOREIGN KEY ("specId") REFERENCES "work_order_spec"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bom_item_details" ADD CONSTRAINT "FK_318c2a293d8a3fea00d4d9893dd" FOREIGN KEY ("bomId") REFERENCES "bom_master"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bom_item_details" ADD CONSTRAINT "FK_fcb43847b509280231c91c98db3" FOREIGN KEY ("materialId") REFERENCES "items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bom_master" ADD CONSTRAINT "FK_6feed63743def1c3e7d85c276a2" FOREIGN KEY ("styleStyleNo") REFERENCES "master_style"("styleNo") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "master_style" ADD CONSTRAINT "FK_f75e98d662d1fd5ec4be014e67b" FOREIGN KEY ("overviewId") REFERENCES "style_overview"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "contract" ADD CONSTRAINT "FK_a5b5d40d78c0a2101aa75fb5d94" FOREIGN KEY ("styleNo") REFERENCES "master_style"("styleNo") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tx_receiving" ADD CONSTRAINT "FK_4ab6762ff4ddb3cba477ab029de" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_order"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tx_receiving" DROP CONSTRAINT "FK_4ab6762ff4ddb3cba477ab029de"`);
        await queryRunner.query(`ALTER TABLE "contract" DROP CONSTRAINT "FK_a5b5d40d78c0a2101aa75fb5d94"`);
        await queryRunner.query(`ALTER TABLE "master_style" DROP CONSTRAINT "FK_f75e98d662d1fd5ec4be014e67b"`);
        await queryRunner.query(`ALTER TABLE "bom_master" DROP CONSTRAINT "FK_6feed63743def1c3e7d85c276a2"`);
        await queryRunner.query(`ALTER TABLE "bom_item_details" DROP CONSTRAINT "FK_fcb43847b509280231c91c98db3"`);
        await queryRunner.query(`ALTER TABLE "bom_item_details" DROP CONSTRAINT "FK_318c2a293d8a3fea00d4d9893dd"`);
        await queryRunner.query(`ALTER TABLE "work_order_size_spec_row" DROP CONSTRAINT "FK_40b2a69017ba0776c6fc7a9e2fc"`);
        await queryRunner.query(`ALTER TABLE "work_orders" DROP CONSTRAINT "FK_477f6f0dce71affd3e23e06537b"`);
        await queryRunner.query(`ALTER TABLE "purchase_order" DROP CONSTRAINT "FK_e5857e1ca4b9649fdde6570691d"`);
        await queryRunner.query(`ALTER TABLE "purchase_order" DROP CONSTRAINT "FK_e4ea5841622429c12889a487f31"`);
        await queryRunner.query(`ALTER TABLE "purchase_order" DROP CONSTRAINT "FK_faea61bb23c7e8294b76ee8fb1d"`);
        await queryRunner.query(`ALTER TABLE "inventories" DROP CONSTRAINT "FK_dba77c53cc779a4c890647f6c74"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f0556d750ef3e5d2007947cc4b"`);
        await queryRunner.query(`DROP TABLE "master_sizes"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8ab288c4c31f58af4d99d1386d"`);
        await queryRunner.query(`DROP TABLE "master_colors"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2973142103004e0750cc3756f8"`);
        await queryRunner.query(`DROP TABLE "master_buyers"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7cb9b02bf0e58aba7a7039d5cd"`);
        await queryRunner.query(`DROP TABLE "master_vendors"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_09b5a66f51de033d20ceeefa96"`);
        await queryRunner.query(`DROP TABLE "master_materials"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ab88f38369365bf35606d740d1"`);
        await queryRunner.query(`DROP TABLE "master_styles"`);
        await queryRunner.query(`DROP TABLE "tx_receiving"`);
        await queryRunner.query(`DROP TABLE "import_file"`);
        await queryRunner.query(`DROP TYPE "public"."import_file_status_enum"`);
        await queryRunner.query(`DROP TABLE "mapping_exception_logs"`);
        await queryRunner.query(`DROP TABLE "mapping_rules"`);
        await queryRunner.query(`DROP TABLE "staging_parse_raw"`);
        await queryRunner.query(`DROP TABLE "contract"`);
        await queryRunner.query(`DROP TABLE "style_overview"`);
        await queryRunner.query(`DROP TYPE "public"."style_overview_status_enum"`);
        await queryRunner.query(`DROP TABLE "master_style"`);
        await queryRunner.query(`DROP TABLE "bom_master"`);
        await queryRunner.query(`DROP TABLE "bom_item_details"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TABLE "ai_usage_log"`);
        await queryRunner.query(`DROP TABLE "work_order_spec"`);
        await queryRunner.query(`DROP TABLE "work_order_size_spec_row"`);
        await queryRunner.query(`DROP TABLE "work_orders"`);
        await queryRunner.query(`DROP TABLE "items"`);
        await queryRunner.query(`DROP TABLE "purchase_order"`);
        await queryRunner.query(`DROP TABLE "shipments"`);
        await queryRunner.query(`DROP TABLE "suppliers"`);
        await queryRunner.query(`DROP TABLE "inventories"`);
    }

}
