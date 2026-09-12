import { z } from "zod";

/**
 * Released minors of contract major 1. Writers stamp the minor they targeted;
 * readers must accept every value listed here (see packages/schemas/README.md).
 */
export const SchemaVersionV1 = z.enum(["1.0"]);

export type SchemaVersionV1 = z.infer<typeof SchemaVersionV1>;
