import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
import {
  inviteUser,
  listUsers,
  updateUser,
  deleteUser,
  resendInvitation,
  setPasswordFromInvite,
  getInviteDetails,
  type UserOperationContext,
} from "./users.service.js";

function context(req: Request): UserOperationContext {
  if (!req.auth || !req.tenantId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  const actor = requireAuthenticatedAuditActor({
    tenantId: req.tenantId,
    actorId: req.auth.userId,
    actorEmail: req.auth.email,
    actorRole: req.auth.role,
  });

  return {
    tenantId: actor.tenantId,
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    traceId: req.traceId,
    requestId: req.requestId,
  };
}

export async function inviteUserController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await inviteUser(req.body, context(req));

    const emailOk = result.emailDelivery?.sent !== false;
    res.status(201).json({
      success: true,
      message: emailOk
        ? "User invitation created successfully. An email has been sent to the invited user."
        : "User invitation created successfully, but the invitation email could not be sent. Please resend the invitation.",
      data: result,
    });
  } catch (error) {
    handleUserError(error, res, next);
  }
}

export async function getInviteDetailsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res
      .status(200)
      .json({ success: true, data: await getInviteDetails(req.body) });
  } catch (error) {
    handleUserError(error, res, next);
  }
}

export async function setPasswordFromInviteController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await setPasswordFromInvite(req.body);

    res.status(200).json({
      success: true,
      message: "Password set successfully. You can now log in.",
      data: result,
    });
  } catch (error) {
    handleUserError(error, res, next);
  }
}

export async function resendInvitationController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const targetUserId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    if (!targetUserId) {
      throw new AppError(400, "BAD_REQUEST", "Missing user id parameter");
    }

    const result = await resendInvitation(
      context(req),
      targetUserId,
    );

    res.status(200).json({
      success: true,
      message: "Invitation email resent successfully.",
      data: result,
    });
  } catch (error) {
    handleUserError(error, res, next);
  }
}

export async function listUsersController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await listUsers(req.query, context(req));

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleUserError(error, res, next);
  }
}

export async function updateUserController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const targetUserId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    if (!targetUserId) {
      throw new AppError(400, "BAD_REQUEST", "Missing user id parameter");
    }

    const result = await updateUser(req.body, context(req), targetUserId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleUserError(error, res, next);
  }
}

export async function deleteUserController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const targetUserId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    if (!targetUserId) {
      throw new AppError(400, "BAD_REQUEST", "Missing user id parameter");
    }

    const result = await deleteUser(context(req), targetUserId);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    handleUserError(error, res, next);
  }
}

function handleUserError(error: unknown, _res: Response, next: NextFunction) {
  next(error);
}
