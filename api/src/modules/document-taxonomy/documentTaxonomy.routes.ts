import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { createDocumentTaxonomyController } from "./documentTaxonomy.controller.js";
import type { DocumentTaxonomyService } from "./documentTaxonomy.service.js";
import type { TaxonomyKind } from "./documentTaxonomy.types.js";

const routeDefinitions: ReadonlyArray<{ kind: TaxonomyKind; path: string }> = [
  { kind: "category", path: "categories" },
  { kind: "department", path: "departments" },
  { kind: "classification", path: "classifications" },
];

/**
 * @openapi
 * /document-taxonomy/categories:
 *   get:
 *     summary: List categories
 *     description: Returns a paginated list of document taxonomy categories for
 *       the tenant, with optional status filtering and a search term. The same
 *       collection endpoints exist for departments and classifications.
 *     tags: [Document Taxonomy]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of records per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, archived, all]
 *           default: active
 *         description: Filter records by status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term matched against the taxonomy name
 *     responses:
 *       200:
 *         description: Paginated list of categories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     categories:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           description:
 *                             type: string
 *                             nullable: true
 *                           status:
 *                             type: string
 *                             enum: [active, archived]
 *                           version:
 *                             type: integer
 *                           createdBy:
 *                             type: string
 *                           updatedBy:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         pageSize:
 *                           type: integer
 *                         totalRecords:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *   post:
 *     summary: Create category
 *     description: Creates a new document taxonomy category for the tenant. The
 *       name is normalized for uniqueness and a duplicate name is rejected.
 *     tags: [Document Taxonomy]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 description: Display name of the category
 *               description:
 *                 type: string
 *                 nullable: true
 *                 description: Optional description of the category
 *     responses:
 *       201:
 *         description: Category created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     category:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         description:
 *                           type: string
 *                           nullable: true
 *                         status:
 *                           type: string
 *                           enum: [active, archived]
 *                         version:
 *                           type: integer
 *                         createdBy:
 *                           type: string
 *                         updatedBy:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       409:
 *         description: A category with this name already exists
 * /document-taxonomy/categories/{id}:
 *   get:
 *     summary: Get category by id
 *     description: Returns a single document taxonomy category for the tenant
 *       identified by its id.
 *     tags: [Document Taxonomy]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Taxonomy record id
 *     responses:
 *       200:
 *         description: Category details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     category:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         description:
 *                           type: string
 *                           nullable: true
 *                         status:
 *                           type: string
 *                           enum: [active, archived]
 *                         version:
 *                           type: integer
 *                         createdBy:
 *                           type: string
 *                         updatedBy:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Malformed or missing id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Category not found
 *   patch:
 *     summary: Update category
 *     description: Updates the name or description of a document taxonomy
 *       category. The version field is required and used for optimistic
 *       concurrency control.
 *     tags: [Document Taxonomy]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Taxonomy record id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [version]
 *             properties:
 *               version:
 *                 type: integer
 *                 description: Expected current version of the record
 *               name:
 *                 type: string
 *                 description: New display name
 *               description:
 *                 type: string
 *                 nullable: true
 *                 description: New description
 *     responses:
 *       200:
 *         description: Category updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     category:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         status:
 *                           type: string
 *                           enum: [active, archived]
 *                         version:
 *                           type: integer
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Category not found
 *       409:
 *         description: Version conflict or record is archived
 * /document-taxonomy/categories/{id}/archive:
 *   post:
 *     summary: Archive category
 *     description: Archives a document taxonomy category so it can no longer be
 *       used for new assignments. Requires the current version for optimistic
 *       concurrency control.
 *     tags: [Document Taxonomy]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Taxonomy record id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [version]
 *             properties:
 *               version:
 *                 type: integer
 *                 description: Expected current version of the record
 *     responses:
 *       200:
 *         description: Category archived successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     category:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         status:
 *                           type: string
 *                           enum: [active, archived]
 *                         version:
 *                           type: integer
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Category not found
 *       409:
 *         description: Version conflict or record already archived
 * /document-taxonomy/categories/{id}/restore:
 *   post:
 *     summary: Restore category
 *     description: Restores an archived document taxonomy category back to the
 *       active state. Requires the current version for optimistic concurrency
 *       control.
 *     tags: [Document Taxonomy]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Taxonomy record id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [version]
 *             properties:
 *               version:
 *                 type: integer
 *                 description: Expected current version of the record
 *     responses:
 *       200:
 *         description: Category restored successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     category:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         status:
 *                           type: string
 *                           enum: [active, archived]
 *                         version:
 *                           type: integer
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Category not found
 *       409:
 *         description: Version conflict or record already active
 * /document-taxonomy/departments:
 *   get:
 *     summary: List departments
 *     description: Returns a paginated list of document taxonomy departments
 *       for the tenant, with optional status filtering and a search term.
 *     tags: [Document Taxonomy]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of records per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, archived, all]
 *           default: active
 *         description: Filter records by status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term matched against the taxonomy name
 *     responses:
 *       200:
 *         description: Paginated list of departments
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     departments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           description:
 *                             type: string
 *                             nullable: true
 *                           status:
 *                             type: string
 *                             enum: [active, archived]
 *                           version:
 *                             type: integer
 *                           createdBy:
 *                             type: string
 *                           updatedBy:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         pageSize:
 *                           type: integer
 *                         totalRecords:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *   post:
 *     summary: Create department
 *     description: Creates a new document taxonomy department for the tenant.
 *       The name is normalized for uniqueness and a duplicate name is rejected.
 *     tags: [Document Taxonomy]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 description: Display name of the department
 *               description:
 *                 type: string
 *                 nullable: true
 *                 description: Optional description of the department
 *     responses:
 *       201:
 *         description: Department created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     department:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         description:
 *                           type: string
 *                           nullable: true
 *                         status:
 *                           type: string
 *                           enum: [active, archived]
 *                         version:
 *                           type: integer
 *                         createdBy:
 *                           type: string
 *                         updatedBy:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       409:
 *         description: A department with this name already exists
 * /document-taxonomy/departments/{id}:
 *   get:
 *     summary: Get department by id
 *     description: Returns a single document taxonomy department for the tenant
 *       identified by its id.
 *     tags: [Document Taxonomy]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Taxonomy record id
 *     responses:
 *       200:
 *         description: Department details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     department:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         description:
 *                           type: string
 *                           nullable: true
 *                         status:
 *                           type: string
 *                           enum: [active, archived]
 *                         version:
 *                           type: integer
 *                         createdBy:
 *                           type: string
 *                         updatedBy:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Malformed or missing id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Department not found
 *   patch:
 *     summary: Update department
 *     description: Updates the name or description of a document taxonomy
 *       department. The version field is required and used for optimistic
 *       concurrency control.
 *     tags: [Document Taxonomy]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Taxonomy record id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [version]
 *             properties:
 *               version:
 *                 type: integer
 *                 description: Expected current version of the record
 *               name:
 *                 type: string
 *                 description: New display name
 *               description:
 *                 type: string
 *                 nullable: true
 *                 description: New description
 *     responses:
 *       200:
 *         description: Department updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     department:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         status:
 *                           type: string
 *                           enum: [active, archived]
 *                         version:
 *                           type: integer
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Department not found
 *       409:
 *         description: Version conflict or record is archived
 * /document-taxonomy/departments/{id}/archive:
 *   post:
 *     summary: Archive department
 *     description: Archives a document taxonomy department so it can no longer
 *       be used for new assignments. Requires the current version for optimistic
 *       concurrency control.
 *     tags: [Document Taxonomy]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Taxonomy record id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [version]
 *             properties:
 *               version:
 *                 type: integer
 *                 description: Expected current version of the record
 *     responses:
 *       200:
 *         description: Department archived successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     department:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         status:
 *                           type: string
 *                           enum: [active, archived]
 *                         version:
 *                           type: integer
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Department not found
 *       409:
 *         description: Version conflict or record already archived
 * /document-taxonomy/departments/{id}/restore:
 *   post:
 *     summary: Restore department
 *     description: Restores an archived document taxonomy department back to
 *       the active state. Requires the current version for optimistic
 *       concurrency control.
 *     tags: [Document Taxonomy]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Taxonomy record id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [version]
 *             properties:
 *               version:
 *                 type: integer
 *                 description: Expected current version of the record
 *     responses:
 *       200:
 *         description: Department restored successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     department:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         status:
 *                           type: string
 *                           enum: [active, archived]
 *                         version:
 *                           type: integer
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Department not found
 *       409:
 *         description: Version conflict or record already active
 * /document-taxonomy/classifications:
 *   get:
 *     summary: List classifications
 *     description: Returns a paginated list of document taxonomy classifications
 *       for the tenant, with optional status filtering and a search term.
 *     tags: [Document Taxonomy]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of records per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, archived, all]
 *           default: active
 *         description: Filter records by status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term matched against the taxonomy name
 *     responses:
 *       200:
 *         description: Paginated list of classifications
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     classifications:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           description:
 *                             type: string
 *                             nullable: true
 *                           status:
 *                             type: string
 *                             enum: [active, archived]
 *                           version:
 *                             type: integer
 *                           level:
 *                             type: string
 *                             enum: [internal, restricted, confidential, highly_confidential]
 *                           createdBy:
 *                             type: string
 *                           updatedBy:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         pageSize:
 *                           type: integer
 *                         totalRecords:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *   post:
 *     summary: Create classification
 *     description: Creates a new document taxonomy classification for the
 *       tenant. The name is normalized for uniqueness and the classification
 *       level is required.
 *     tags: [Document Taxonomy]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, level]
 *             properties:
 *               name:
 *                 type: string
 *                 description: Display name of the classification
 *               description:
 *                 type: string
 *                 nullable: true
 *                 description: Optional description of the classification
 *               level:
 *                 type: string
 *                 enum: [internal, restricted, confidential, highly_confidential]
 *                 description: Security classification level
 *     responses:
 *       201:
 *         description: Classification created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     classification:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         description:
 *                           type: string
 *                           nullable: true
 *                         status:
 *                           type: string
 *                           enum: [active, archived]
 *                         version:
 *                           type: integer
 *                         level:
 *                           type: string
 *                           enum: [internal, restricted, confidential, highly_confidential]
 *                         createdBy:
 *                           type: string
 *                         updatedBy:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Validation error or invalid classification level
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       409:
 *         description: A classification with this name already exists
 * /document-taxonomy/classifications/{id}:
 *   get:
 *     summary: Get classification by id
 *     description: Returns a single document taxonomy classification for the
 *       tenant identified by its id.
 *     tags: [Document Taxonomy]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Taxonomy record id
 *     responses:
 *       200:
 *         description: Classification details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     classification:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         description:
 *                           type: string
 *                           nullable: true
 *                         status:
 *                           type: string
 *                           enum: [active, archived]
 *                         version:
 *                           type: integer
 *                         level:
 *                           type: string
 *                           enum: [internal, restricted, confidential, highly_confidential]
 *                         createdBy:
 *                           type: string
 *                         updatedBy:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Malformed or missing id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Classification not found
 *   patch:
 *     summary: Update classification
 *     description: Updates the name, description or level of a document taxonomy
 *       classification. The version field is required and used for optimistic
 *       concurrency control.
 *     tags: [Document Taxonomy]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Taxonomy record id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [version]
 *             properties:
 *               version:
 *                 type: integer
 *                 description: Expected current version of the record
 *               name:
 *                 type: string
 *                 description: New display name
 *               description:
 *                 type: string
 *                 nullable: true
 *                 description: New description
 *               level:
 *                 type: string
 *                 enum: [internal, restricted, confidential, highly_confidential]
 *                 description: New security classification level
 *     responses:
 *       200:
 *         description: Classification updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     classification:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         status:
 *                           type: string
 *                           enum: [active, archived]
 *                         version:
 *                           type: integer
 *                         level:
 *                           type: string
 *                           enum: [internal, restricted, confidential, highly_confidential]
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Validation error or invalid classification level
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Classification not found
 *       409:
 *         description: Version conflict or record is archived
 * /document-taxonomy/classifications/{id}/archive:
 *   post:
 *     summary: Archive classification
 *     description: Archives a document taxonomy classification so it can no
 *       longer be used for new assignments. Requires the current version for
 *       optimistic concurrency control.
 *     tags: [Document Taxonomy]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Taxonomy record id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [version]
 *             properties:
 *               version:
 *                 type: integer
 *                 description: Expected current version of the record
 *     responses:
 *       200:
 *         description: Classification archived successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     classification:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         status:
 *                           type: string
 *                           enum: [active, archived]
 *                         version:
 *                           type: integer
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Classification not found
 *       409:
 *         description: Version conflict or record already archived
 * /document-taxonomy/classifications/{id}/restore:
 *   post:
 *     summary: Restore classification
 *     description: Restores an archived document taxonomy classification back
 *       to the active state. Requires the current version for optimistic
 *       concurrency control.
 *     tags: [Document Taxonomy]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Taxonomy record id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [version]
 *             properties:
 *               version:
 *                 type: integer
 *                 description: Expected current version of the record
 *     responses:
 *       200:
 *         description: Classification restored successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     classification:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         status:
 *                           type: string
 *                           enum: [active, archived]
 *                         version:
 *                           type: integer
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Classification not found
 *       409:
 *         description: Version conflict or record already active
 */
export function createDocumentTaxonomyRouter(service?: DocumentTaxonomyService) {
  const router = Router();
  const controller = createDocumentTaxonomyController(service);
  router.use(authenticate, tenantScoping);

  for (const definition of routeDefinitions) {
    const base = `/${definition.path}`;
    router.get(base, requirePermission(Permission.COMPANY_SETTINGS_READ), controller.list(definition.kind));
    router.post(base, requirePermission(Permission.COMPANY_SETTINGS_UPDATE), controller.create(definition.kind));
    router.get(`${base}/:id`, requirePermission(Permission.COMPANY_SETTINGS_READ), controller.get(definition.kind));
    router.patch(`${base}/:id`, requirePermission(Permission.COMPANY_SETTINGS_UPDATE), controller.update(definition.kind));
    router.post(`${base}/:id/archive`, requirePermission(Permission.COMPANY_SETTINGS_UPDATE), controller.archive(definition.kind));
    router.post(`${base}/:id/restore`, requirePermission(Permission.COMPANY_SETTINGS_UPDATE), controller.restore(definition.kind));
  }
  return router;
}

export default createDocumentTaxonomyRouter();
