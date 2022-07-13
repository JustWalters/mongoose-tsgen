/* tslint:disable */
/* eslint-disable */

// ######################################## THIS FILE WAS GENERATED BY MONGOOSE-TSGEN ######################################## //

// NOTE: ANY CHANGES MADE WILL BE OVERWRITTEN ON SUBSEQUENT EXECUTIONS OF MONGOOSE-TSGEN.

import mongoose from "mongoose";

import { Prop, Schema } from '@nestjs/mongoose';
import { SchemaFactory } from 'app/core/infrastructure/schema.factory';

/**
 * Lean version of ReportLetterOfEngagementDocument
 * 
 * This has all Mongoose getters & functions removed. This type will be returned from `ReportDocument.toObject()`.
 * ```
 * const reportObject = report.toObject();
 * ```
 */
@Schema()
export class ReportLetterOfEngagement extends mongoose.Types.Subdocument {
@Prop({"required":true,"type":String})
name: string;
@Prop({"type":String})
fileName?: string;
_id: mongoose.Types.ObjectId;
}

export const ReportLetterOfEngagementSchema = SchemaFactory.createForClass(ReportLetterOfEngagement);

/**
 * Lean version of ReportProvidedDocumentDocument
 * 
 * This has all Mongoose getters & functions removed. This type will be returned from `ReportDocument.toObject()`.
 * ```
 * const reportObject = report.toObject();
 * ```
 */
@Schema()
export class ReportProvidedDocument extends mongoose.Types.Subdocument {
@Prop({"required":true,"type":String})
name: string;
@Prop({"type":String})
fileName?: string;
_id: mongoose.Types.ObjectId;
}

export const ReportProvidedDocumentSchema = SchemaFactory.createForClass(ReportProvidedDocument);

/**
 * Lean version of ReportDefinitionOfMarketValueDocument
 * 
 * This has all Mongoose getters & functions removed. This type will be returned from `ReportDocument.toObject()`.
 * ```
 * const reportObject = report.toObject();
 * ```
 */
@Schema()
export class ReportDefinitionOfMarketValue extends mongoose.Types.Subdocument {
@Prop({"default":"JustinTODO","required":true,"type":mongoose.Types.Mixed})
narrative: any;
@Prop({"default":false,"required":true,"type":Boolean})
locked: boolean;
@Prop({"default":false,"required":true,"type":Boolean})
modified: boolean;
_id: mongoose.Types.ObjectId;
}

export const ReportDefinitionOfMarketValueSchema = SchemaFactory.createForClass(ReportDefinitionOfMarketValue);

/**
 * Lean version of ReportDocument
 * 
 * This has all Mongoose getters & functions removed. This type will be returned from `ReportDocument.toObject()`. To avoid conflicts with model names, use the type alias `ReportObject`.
 * ```
 * const reportObject = report.toObject();
 * ```
 */
@Schema()
export class Report extends mongoose.Types.Document {
@Prop({"type":String})
name?: string;
_id: mongoose.Types.ObjectId;
@Prop({"type":ReportLetterOfEngagementSchema,"default":null})
letterOfEngagement?: ReportLetterOfEngagement;
@Prop({"type":[ReportProvidedDocumentSchema],"default":[],"required":true})
providedDocuments: mongoose.Types.DocumentArray<ReportProvidedDocument>;
@Prop({"type":ReportDefinitionOfMarketValueSchema,"default":{}})
definitionOfMarketValue?: ReportDefinitionOfMarketValue;
}

export const ReportSchema = SchemaFactory.createForClass(Report);

/**
 * Lean version of ReportDocument (type alias of `Report`)
 * 
 * Use this type alias to avoid conflicts with model names:
 * ```
 * import { Report } from "../models"
 * import { ReportObject } from "../interfaces/mongoose.gen.ts"
 * 
 * const reportObject: ReportObject = report.toObject();
 * ```
 */
export type ReportObject = Report

/**
 * Mongoose Query type
 * 
 * This type is returned from query functions. For most use cases, you should not need to use this type explicitly.
 */
export type ReportQuery = mongoose.Query<any, ReportDocument, ReportQueries> & ReportQueries

/**
 * Mongoose Query helper types
 * 
 * This type represents `ReportSchema.query`. For most use cases, you should not need to use this type explicitly.
 */
export type ReportQueries = {
}

export type ReportMethods = {
}

export type ReportStatics = {
}

/**
 * Mongoose Model type
 * 
 * Pass this type to the Mongoose Model constructor:
 * ```
 * const Report = mongoose.model<ReportDocument, ReportModel>("Report", ReportSchema);
 * ```
 */
export type ReportModel = mongoose.Model<ReportDocument, ReportQueries> & ReportStatics

/**
 * Mongoose Schema type
 * 
 * Assign this type to new Report schema instances:
 * ```
 * const ReportSchema: ReportSchema = new mongoose.Schema({ ... })
 * ```
 */
export type ReportSchema = mongoose.Schema<ReportDocument, ReportModel, ReportMethods, ReportQueries>

/**
 * Mongoose Document type
 * 
 * Pass this type to the Mongoose Model constructor:
 * ```
 * const Report = mongoose.model<ReportDocument, ReportModel>("Report", ReportSchema);
 * ```
 */
export type ReportLetterOfEngagementDocument = mongoose.Document<mongoose.Types.ObjectId> & {
name: string;
fileName?: string;
_id: mongoose.Types.ObjectId;
}

/**
 * Mongoose Subdocument type
 * 
 * Type of `ReportDocument["providedDocuments"]` element.
 */
export type ReportProvidedDocumentDocument = mongoose.Types.Subdocument & {
name: string;
fileName?: string;
_id: mongoose.Types.ObjectId;
}

/**
 * Mongoose Document type
 * 
 * Pass this type to the Mongoose Model constructor:
 * ```
 * const Report = mongoose.model<ReportDocument, ReportModel>("Report", ReportSchema);
 * ```
 */
export type ReportDefinitionOfMarketValueDocument = mongoose.Document<mongoose.Types.ObjectId> & {
narrative: any;
locked: boolean;
modified: boolean;
_id: mongoose.Types.ObjectId;
}

/**
 * Mongoose Document type
 * 
 * Pass this type to the Mongoose Model constructor:
 * ```
 * const Report = mongoose.model<ReportDocument, ReportModel>("Report", ReportSchema);
 * ```
 */
export type ReportDocument = mongoose.Document<mongoose.Types.ObjectId, ReportQueries> & ReportMethods & {
name?: string;
_id: mongoose.Types.ObjectId;
letterOfEngagement?: ReportLetterOfEngagementDocument;
providedDocuments: mongoose.Types.DocumentArray<ReportProvidedDocumentDocument>;
definitionOfMarketValue?: ReportDefinitionOfMarketValueDocument;
}

/**
 * Check if a property on a document is populated:
 * ```
 * import { IsPopulated } from "../interfaces/mongoose.gen.ts"
 * 
 * if (IsPopulated<UserDocument["bestFriend"]>) { ... }
 * ```
 */
export function IsPopulated<T>(doc: T | mongoose.Types.ObjectId): doc is T {
  return doc instanceof mongoose.Document;
}

/**
 * Helper type used by `PopulatedDocument`. Returns the parent property of a string 
 * representing a nested property (i.e. `friend.user` -> `friend`)
 */
type ParentProperty<T> = T extends `${infer P}.${string}` ? P : never;

/**
* Helper type used by `PopulatedDocument`. Returns the child property of a string 
* representing a nested property (i.e. `friend.user` -> `user`).
*/
type ChildProperty<T> = T extends `${string}.${infer C}` ? C : never;

/**
* Helper type used by `PopulatedDocument`. Removes the `ObjectId` from the general union type generated 
* for ref documents (i.e. `mongoose.Types.ObjectId | UserDocument` -> `UserDocument`)
*/
type PopulatedProperty<Root, T extends keyof Root> = Omit<Root, T> & { 
  [ref in T]: Root[T] extends mongoose.Types.Array<infer U> ? 
    mongoose.Types.Array<Exclude<U, mongoose.Types.ObjectId>> :
    Exclude<Root[T], mongoose.Types.ObjectId> 
}

/**
 * Populate properties on a document type:
 * ```
 * import { PopulatedDocument } from "../interfaces/mongoose.gen.ts"
 *
 * function example(user: PopulatedDocument<UserDocument, "bestFriend">) {
 *   console.log(user.bestFriend._id) // typescript knows this is populated
 * }
 * ```
 */
export type PopulatedDocument<
DocType,
T
> = T extends keyof DocType
? PopulatedProperty<DocType, T> 
: (
    ParentProperty<T> extends keyof DocType
      ? Omit<DocType, ParentProperty<T>> &
      {
        [ref in ParentProperty<T>]: (
          DocType[ParentProperty<T>] extends mongoose.Types.Array<infer U> ? (
            mongoose.Types.Array<
              ChildProperty<T> extends keyof U 
                ? PopulatedProperty<U, ChildProperty<T>> 
                : PopulatedDocument<U, ChildProperty<T>>
            >
          ) : (
            ChildProperty<T> extends keyof DocType[ParentProperty<T>]
            ? PopulatedProperty<DocType[ParentProperty<T>], ChildProperty<T>>
            : PopulatedDocument<DocType[ParentProperty<T>], ChildProperty<T>>
          )
        )
      }
      : DocType
  )

/**
 * Helper types used by the populate overloads
 */
type Unarray<T> = T extends Array<infer U> ? U : T;
type Modify<T, R> = Omit<T, keyof R> & R;

/**
 * Augment mongoose with Query.populate overloads
 */
declare module "mongoose" {
  interface Query<ResultType, DocType, THelpers = {}> {
    populate<T extends string>(path: T, select?: string | any, model?: string | Model<any, THelpers>, match?: any): Query<
      ResultType extends Array<DocType> ? Array<PopulatedDocument<Unarray<ResultType>, T>> : (ResultType extends DocType ? PopulatedDocument<Unarray<ResultType>, T> : ResultType),
      DocType,
      THelpers
    > & THelpers;

    populate<T extends string>(options: Modify<PopulateOptions, { path: T }> | Array<PopulateOptions>): Query<
      ResultType extends Array<DocType> ? Array<PopulatedDocument<Unarray<ResultType>, T>> : (ResultType extends DocType ? PopulatedDocument<Unarray<ResultType>, T> : ResultType),
      DocType,
      THelpers
    > & THelpers;
  }
}



