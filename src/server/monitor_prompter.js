import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { Examples } from '../utils/examples.js';
import { settings } from '../../settings.js';
import { prompts } from './monitor_profile.js';
import { getCommandDocs } from './monitor_commands.js';
import { Gemini } from '../models/gemini.js';
import { GPT } from '../models/gpt.js';
import { Claude } from '../models/claude.js';
import { Mistral } from '../models/mistral.js';
import { ReplicateAPI } from '../models/replicate.js';
import { Local } from '../models/local.js';
import { Novita } from '../models/novita.js';
import { GroqCloudAPI } from '../models/groq.js';
import { HuggingFace } from '../models/huggingface.js';
import { Qwen } from "../models/qwen.js";
import { Doubao } from "../models/doubao.js";
import { Pollinations } from "../models/pollinations.js";
import { Grok } from "../models/grok.js";
import { DeepSeek } from '../models/deepseek.js';
import { Hyperbolic } from '../models/hyperbolic.js';
import { GLHF } from '../models/glhf.js';
import { OpenRouter } from '../models/openrouter.js';

export class Prompter {
    constructor() {
        let monitor_model_profile = this._selectAPI(settings.monitor_model);
        this.monitor_model = this._createModel(monitor_model_profile);

        let embedding = settings.monitor_embedding;
        if (embedding === undefined) {
            if (monitor_model_profile.api !== 'ollama')
                embedding = {api: monitor_model_profile.api};
            else
                embedding = {api: 'none'};
        }
        else if (typeof embedding === 'string' || embedding instanceof String)
            embedding = {api: embedding};

        console.log('Using embedding settings:', embedding);

        this.embedding_model = null;
        try {
            if (embedding.api === 'google')
                this.embedding_model = new Gemini(embedding.model, embedding.url);
            else if (embedding.api === 'openai')
                this.embedding_model = new GPT(embedding.model, embedding.url);
            else if (embedding.api === 'replicate')
                this.embedding_model = new ReplicateAPI(embedding.model, embedding.url);
            else if (embedding.api === 'ollama')
                this.embedding_model = new Local(embedding.model, embedding.url);
            else if (embedding.api === 'qwen')
                this.embedding_model = new Qwen(embedding.model, embedding.url);
            else if (embedding.api === 'doubao')
                this.embedding_model = new Doubao(embedding.model, embedding.url);
            else if (embedding.api === 'mistral')
                this.embedding_model = new Mistral(embedding.model, embedding.url);
            else if (embedding.api === 'huggingface')
                this.embedding_model = new HuggingFace(embedding.model, embedding.url);
            else if (embedding.api === 'novita')
                this.embedding_model = new Novita(embedding.model, embedding.url);
            else {
                this.embedding_model = null;
                let embedding_name = embedding ? embedding.api : '[NOT SPECIFIED]'
                console.warn('Unsupported embedding: ' + embedding_name + '. Using word-overlap instead, expect reduced performance. Recommend using a supported embedding model. See Readme.');
            }
        }
        catch (err) {
            console.warn('Warning: Failed to initialize embedding model for monitor:', err.message);
            console.log('Continuing anyway, using word-overlap instead.');
            this.embedding_model = null;
        }
    }

    _selectAPI(profile) {
        if (typeof profile === 'string' || profile instanceof String) {
            profile = {model: profile};
        }
        if (!profile.api) {
            if (profile.model.includes('openrouter/'))
                profile.api = 'openrouter'; // must do first because shares names with other models
            else if (profile.model.includes('ollama/'))
                profile.api = 'ollama'; // also must do early because shares names with other models
            else if (profile.model.includes('gemini'))
                profile.api = 'google';
            else if (profile.model.includes('gpt') || profile.model.includes('o1')|| profile.model.includes('o3'))
                profile.api = 'openai';
            else if (profile.model.includes('claude'))
                profile.api = 'anthropic';
            else if (profile.model.includes('huggingface/'))
                profile.api = "huggingface";
            else if (profile.model.includes('replicate/'))
                profile.api = 'replicate';
            else if (profile.model.includes('mistralai/') || profile.model.includes("mistral/"))
                model_profile.api = 'mistral';
            else if (profile.model.includes("groq/") || profile.model.includes("groqcloud/"))
                profile.api = 'groq';
            else if (profile.model.includes("glhf/"))
                profile.api = 'glhf';
            else if (profile.model.includes("hyperbolic/"))
                profile.api = 'hyperbolic';
            else if (profile.model.includes('novita/'))
                profile.api = 'novita';
            else if (profile.model.includes('qwen'))
                profile.api = 'qwen';
            else if (profile.model.includes('doubao'))
                profile.api = 'doubao';
            else if (profile.model.includes('grok'))
                profile.api = 'xai';
            else if (profile.model.includes('deepseek'))
                profile.api = 'deepseek';
	          else if (profile.model.includes('mistral'))
                profile.api = 'mistral';
            else 
                throw new Error('Unknown model:', profile.model);
        }
        return profile;
    }

    _createModel(profile) {
        let model = null;
        if (profile.api === 'google')
            model = new Gemini(profile.model, profile.url, profile.params);
        else if (profile.api === 'openai')
            model = new GPT(profile.model, profile.url, profile.params);
        else if (profile.api === 'anthropic')
            model = new Claude(profile.model, profile.url, profile.params);
        else if (profile.api === 'replicate')
            model = new ReplicateAPI(profile.model.replace('replicate/', ''), profile.url, profile.params);
        else if (profile.api === 'ollama')
            model = new Local(profile.model.replace('ollama/', ''), profile.url, profile.params);
        else if (profile.api === 'ollama-agent')
            model = new LocalAgent(profile.model.replace('ollama/', ''), profile.url, profile.params);
        else if (profile.api === 'mistral')
            model = new Mistral(profile.model, profile.url, profile.params);
        else if (profile.api === 'groq')
            model = new GroqCloudAPI(profile.model.replace('groq/', '').replace('groqcloud/', ''), profile.url, profile.params);
        else if (profile.api === 'huggingface')
            model = new HuggingFace(profile.model, profile.url, profile.params);
        else if (profile.api === 'glhf')
            model = new GLHF(profile.model.replace('glhf/', ''), profile.url, profile.params);
        else if (profile.api === 'hyperbolic')
            model = new Hyperbolic(profile.model.replace('hyperbolic/', ''), profile.url, profile.params);
        else if (profile.api === 'novita')
            model = new Novita(profile.model.replace('novita/', ''), profile.url, profile.params);
        else if (profile.api === 'qwen')
            model = new Qwen(profile.model, profile.url, profile.params);
        else if (profile.api === 'doubao')
            model = new Doubao(profile.model, profile.url, profile.params);
        else if (profile.api === 'pollinations')
            model = new Pollinations(profile.model, profile.url, profile.params);
        else if (profile.api === 'xai')
            model = new Grok(profile.model, profile.url, profile.params);
        else if (profile.api === 'deepseek')
            model = new DeepSeek(profile.model, profile.url, profile.params);
        else if (profile.api === 'openrouter')
            model = new OpenRouter(profile.model.replace('openrouter/', ''), profile.url, profile.params);
        else
            throw new Error('Unknown API:', profile.api);
        return model;
    }

    async replaceStrings(prompt, messages, query) {
        if (prompt.includes('$QUERY'))
            prompt = prompt.replaceAll('$QUERY', `## User Query:\n${query}\n`);

        if (prompt.includes('$COMMAND_DOCS'))
            prompt = prompt.replaceAll('$COMMAND_DOCS', `## Available Commands: \n${getCommandDocs()}`);

        if (prompt.includes('$EXAMPLES'))
            prompt = prompt.replaceAll('$EXAMPLES', "");

        // check if there are any remaining placeholders with syntax $<word>
        let remaining = prompt.match(/\$[A-Z_]+/g);
        if (remaining !== null) {
            console.warn('Unknown prompt placeholders:', remaining.join(', '));
        }
        return prompt.trim();
    }
    
    async promptMonitorQuery(messages, query) {
        let prompt = prompts.monitoring;
        prompt = await this.replaceStrings(prompt, messages, query);
        // console.log("Prompt:", prompt);
        let generation = await this.monitor_model.sendRequest(messages, prompt);
        return generation;
    }
}
