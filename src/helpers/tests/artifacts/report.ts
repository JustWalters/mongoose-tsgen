// @ts-nocheck
import mongoose, { Schema } from 'mongoose';

const FileReferenceSchema = new Schema({
  name: { type: String, required: true },
  fileName: String,
});
const NamedReferenceSchema = new Schema({
  file: { type: FileReferenceSchema, required: true },
});

const identity = arg => { return arg; }
const generate = identity
// const mapDataModel = identity
const updateNarrative = (a, b) => identity(a)
const generatedTextToValue = arg => {
  return { toJS: () => { return arg } };
}
const definitionOfMarketValue = {
  generate: generate,
}
const backEndDataMapping = {}
const NAMES = { WAYNE: 'Wayne' }

const NarrativeSchema = new Schema({
  narrative: {
    type: Schema.Types.Mixed,
    default() {
      const { generate, mapDataModel = identity } = this.getNarrativeOptions();
      if (!generate || !mapDataModel) {
        return undefined;
      }
      const result = generate(mapDataModel(this.ownerDocument()));
      return generatedTextToValue(result).toJS();
    },
    get(value: any) {
      if (!value) {
        return value;
      }
      const { mapDataModel, generate } = this.getNarrativeOptions();
      if (!generate || !mapDataModel) {
        return value;
      }
      const root = this.ownerDocument();
      const sharedData = Object.entries(backEndDataMapping).reduce((result, [name, path]) => {
        // eslint-disable-next-line no-param-reassign
        result[name] = root.get(path);
        return result;
      }, {});
      // treat mapDataModel as correct and override any sharedData (fixes bug with current vs as complete building desc)
      return updateNarrative(value, { ...sharedData, ...mapDataModel(root) });
    },
    required: true,
  },
  locked: { type: Boolean, default: false, required: true },
  modified: { type: Boolean, default: false, required: true },
});

NarrativeSchema.methods.getNarrativeOptions = function () {
  const parent = this.parent();
  // @ts-ignore
  const narrativeOptions = parent.schema.paths[this.$basePath].options.narrative;
  if (narrativeOptions) {
    return narrativeOptions;
  }
  return {};
};

const ReportSchema = new Schema({
  name: String,
  letterOfEngagement: { type: FileReferenceSchema, default: null },
  providedDocuments: { type: [{ type: FileReferenceSchema, default: null }], default: [] },
  definitionOfMarketValue: { type: NarrativeSchema, narrative: definitionOfMarketValue, default: {} },
  inline: new Schema({
    name: String,
    file: { type: FileReferenceSchema, },
    plainFile: FileReferenceSchema,
  }),
  namedReference: { type: NamedReferenceSchema, },
  plainObject: {
    showRETaxes: Boolean,
  },
});

ReportSchema.virtual('nameIsWayne').set(function setName(newName: string) {
  this.name = newName;
  })
ReportSchema.virtual('nameIsWayne')
.get(function nameIsWayne() {
  return this.name === NAMES.WAYNE;
})
// TODO: Fix having virtual in a variable (like below)
// const niwVirt = ReportSchema.virtual('nameIsWayne');

export const Report = mongoose.model('Report', ReportSchema);

export default Report;
