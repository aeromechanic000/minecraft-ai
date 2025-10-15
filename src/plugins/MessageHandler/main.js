
import { Vec3 } from 'vec3';
import { readdirSync, readFileSync } from 'fs';
import * as skills from '../../agent/library/skills.js';
import * as world from '../../agent/library/world.js';
import * as mc from '../../utils/mcdata.js';

export class PluginInstance {
    constructor(agent) {
        this.agent = agent;
        this.memory = {}
    }

    init() {
        this.agent.messageHandlers.push(this.modify_message.bind(this));
    }

    getPluginActions() {
        return [];
    }

    async modify_message(source, message) {
        let newMessage = null;
        console.log("Message modified by plugin 'MessageHandler':", newMessage);
        return [source, newMessage];
    }
}