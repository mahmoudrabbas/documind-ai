import mongoose from "mongoose";
import FeedbackModel, {
  type FeedbackDocument,
  type FeedbackRating,
  type FeedbackCategory,
} from "../../db/models/feedback.model.js";

export interface CreateFeedbackData {
  tenantId: string;
  messageId: string;
  conversationId: string;
  userId: string;
  rating: FeedbackRating;
  category?: FeedbackCategory;
  comment?: string;
}

export interface ListFeedbackFilter {
  tenantId: string;
  rating?: FeedbackRating;
  category?: FeedbackCategory;
  messageId?: string;
  conversationId?: string;
  userId?: string;
  page?: number;
  pageSize?: number;
}

export class FeedbackRepository {
  async upsertFeedback(data: CreateFeedbackData): Promise<FeedbackDocument> {
    const filter = {
      tenantId: new mongoose.Types.ObjectId(data.tenantId),
      messageId: new mongoose.Types.ObjectId(data.messageId),
      userId: new mongoose.Types.ObjectId(data.userId),
    };

    const update = {
      conversationId: new mongoose.Types.ObjectId(data.conversationId),
      rating: data.rating,
      category: data.category || null,
      comment: data.comment || null,
    };

    return FeedbackModel.findOneAndUpdate(filter, update, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }).exec();
  }

  async findFeedbackById(tenantId: string, feedbackId: string): Promise<FeedbackDocument | null> {
    if (!mongoose.Types.ObjectId.isValid(feedbackId)) return null;
    return FeedbackModel.findOne({
      _id: new mongoose.Types.ObjectId(feedbackId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    }).exec();
  }

  async findFeedbackByUserAndMessage(
    tenantId: string,
    userId: string,
    messageId: string,
  ): Promise<FeedbackDocument | null> {
    if (!mongoose.Types.ObjectId.isValid(messageId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return null;
    }
    return FeedbackModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      userId: new mongoose.Types.ObjectId(userId),
      messageId: new mongoose.Types.ObjectId(messageId),
    }).exec();
  }

  async findFeedback(filter: ListFeedbackFilter): Promise<{ feedback: FeedbackDocument[]; total: number }> {
    const query: Record<string, unknown> = {
      tenantId: new mongoose.Types.ObjectId(filter.tenantId),
    };

    if (filter.rating) query.rating = filter.rating;
    if (filter.category) query.category = filter.category;
    if (filter.messageId && mongoose.Types.ObjectId.isValid(filter.messageId)) {
      query.messageId = new mongoose.Types.ObjectId(filter.messageId);
    }
    if (filter.conversationId && mongoose.Types.ObjectId.isValid(filter.conversationId)) {
      query.conversationId = new mongoose.Types.ObjectId(filter.conversationId);
    }
    if (filter.userId && mongoose.Types.ObjectId.isValid(filter.userId)) {
      query.userId = new mongoose.Types.ObjectId(filter.userId);
    }

    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [feedback, total] = await Promise.all([
      FeedbackModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(pageSize).exec(),
      FeedbackModel.countDocuments(query).exec(),
    ]);

    return { feedback, total };
  }

  async getFeedbackStats(tenantId: string): Promise<{
    totalCount: number;
    thumbsUpCount: number;
    thumbsDownCount: number;
    satisfactionRate: number;
    byCategory: Record<FeedbackCategory, number>;
  }> {
    const tenantObjId = new mongoose.Types.ObjectId(tenantId);

    const all = await FeedbackModel.find({ tenantId: tenantObjId }).exec();

    const totalCount = all.length;
    let thumbsUpCount = 0;
    let thumbsDownCount = 0;
    const byCategory: Record<FeedbackCategory, number> = {
      inaccurate: 0,
      incomplete: 0,
      irrelevant: 0,
      harmful: 0,
      other: 0,
    };

    for (const f of all) {
      if (f.rating === "thumbs_up") thumbsUpCount++;
      if (f.rating === "thumbs_down") thumbsDownCount++;
      if (f.category && byCategory[f.category] !== undefined) {
        byCategory[f.category]++;
      }
    }

    const satisfactionRate = totalCount > 0 ? Number((thumbsUpCount / totalCount).toFixed(2)) : 0;

    return {
      totalCount,
      thumbsUpCount,
      thumbsDownCount,
      satisfactionRate,
      byCategory,
    };
  }
}

export const feedbackRepository = new FeedbackRepository();
