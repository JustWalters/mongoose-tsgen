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
@Prop({"required":true})
name: string;
@Prop()
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
@Prop({"required":true})
name: string;
@Prop()
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
@Prop({"default":"MIGRATION_IS_NOT_DONE","required":true,"get":"MIGRATION_IS_NOT_DONE","type":mongoose.Schema.Types.Mixed})
narrative: any;
@Prop({"default":false,"required":true})
locked: boolean;
@Prop({"default":false,"required":true})
modified: boolean;
_id: mongoose.Types.ObjectId;
isLocked: MIGRATE_THIS_VIRTUAL_MANUALLY;
}

export const ReportDefinitionOfMarketValueSchema = SchemaFactory.createForClass(ReportDefinitionOfMarketValue);

/**
 * Lean version of ReportInlineFileDocument
 * 
 * This has all Mongoose getters & functions removed. This type will be returned from `ReportInlineDocument.toObject()`.
 * ```
 * const reportinlineObject = reportinline.toObject();
 * ```
 */
@Schema()
export class ReportInlineFile extends mongoose.Types.Subdocument {
@Prop({"required":true})
name: string;
@Prop()
fileName?: string;
_id: mongoose.Types.ObjectId;
}

export const ReportInlineFileSchema = SchemaFactory.createForClass(ReportInlineFile);

/**
 * Lean version of ReportInlinePlainFileDocument
 * 
 * This has all Mongoose getters & functions removed. This type will be returned from `ReportInlineDocument.toObject()`.
 * ```
 * const reportinlineObject = reportinline.toObject();
 * ```
 */
@Schema()
export class ReportInlinePlainFile extends mongoose.Types.Subdocument {
@Prop({"required":true})
name: string;
@Prop()
fileName?: string;
_id: mongoose.Types.ObjectId;
}

export const ReportInlinePlainFileSchema = SchemaFactory.createForClass(ReportInlinePlainFile);

/**
 * Lean version of ReportInlineDocument
 * 
 * This has all Mongoose getters & functions removed. This type will be returned from `ReportDocument.toObject()`.
 * ```
 * const reportObject = report.toObject();
 * ```
 */
@Schema()
export class ReportInline extends mongoose.Types.Subdocument {
@Prop()
name?: string;
_id: mongoose.Types.ObjectId;
@Prop({"type":ReportInlineFileSchema})
file?: ReportInlineFile;
@Prop({"type":ReportInlinePlainFileSchema})
plainFile?: ReportInlinePlainFile;
}

export const ReportInlineSchema = SchemaFactory.createForClass(ReportInline);

/**
 * Lean version of ReportNamedReferenceFileDocument
 * 
 * This has all Mongoose getters & functions removed. This type will be returned from `ReportNamedReferenceDocument.toObject()`.
 * ```
 * const reportnamedreferenceObject = reportnamedreference.toObject();
 * ```
 */
@Schema()
export class ReportNamedReferenceFile extends mongoose.Types.Subdocument {
@Prop({"required":true})
name: string;
@Prop()
fileName?: string;
_id: mongoose.Types.ObjectId;
}

export const ReportNamedReferenceFileSchema = SchemaFactory.createForClass(ReportNamedReferenceFile);

/**
 * Lean version of ReportNamedReferenceDocument
 * 
 * This has all Mongoose getters & functions removed. This type will be returned from `ReportDocument.toObject()`.
 * ```
 * const reportObject = report.toObject();
 * ```
 */
@Schema()
export class ReportNamedReference extends mongoose.Types.Subdocument {
_id: mongoose.Types.ObjectId;
@Prop({"required":true,"type":ReportNamedReferenceFileSchema})
file: ReportNamedReferenceFile;
}

export const ReportNamedReferenceSchema = SchemaFactory.createForClass(ReportNamedReference);

/**
 * Lean version of ReportDocument
 * 
 * This has all Mongoose getters & functions removed. This type will be returned from `ReportDocument.toObject()`. To avoid conflicts with model names, use the type alias `ReportObject`.
 * ```
 * const reportObject = report.toObject();
 * ```
 */
@Schema()
export class Report extends mongoose.Types.Subdocument {
@Prop()
name?: string;
@Prop({"default":NAMES.WAYNE,"enum":Object.values(NAMES)})
possibleNames?: string;
@Prop({"type":mongoose.Schema.Types.Mixed})
plainObject?: {
showRETaxes?: boolean;
};
_id: mongoose.Types.ObjectId;
@Prop({"type":ReportLetterOfEngagementSchema,"default":null})
letterOfEngagement?: ReportLetterOfEngagement;
@Prop({"type":[ReportProvidedDocumentSchema],"default":[],"required":true})
providedDocuments: mongoose.Types.DocumentArray<ReportProvidedDocument>;
@Prop({"type":ReportDefinitionOfMarketValueSchema,"default":{},"narrative":definitionOfMarketValue})
definitionOfMarketValue?: ReportDefinitionOfMarketValue;
@Prop({"type":ReportInlineSchema})
inline?: ReportInline;
@Prop({"type":ReportNamedReferenceSchema})
namedReference?: ReportNamedReference;

    get "nameIsWayne"(): boolean {
        return this.name === NAMES.WAYNE;
    }

    set "nameIsWayne"(newName: string) {
        this.name = newName;
    }
}

export const ReportSchema = SchemaFactory.createForClass(Report);