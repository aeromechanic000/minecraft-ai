export const settings = {
    "minecraft_version": "1.21.1", // supports up to 1.21.1
    "host": "127.0.0.1", // or "localhost", "your.ip.address.here"
    "port": 55916,
    "auth": "offline", // or "microsoft"

    // the monitor server manages all agents and hosts the UI
    "host_monitor_server": true, // if true, the monitor_server will be hosted on this machine. otherwise, specify a public IP address
    "monitor_server_host": "localhost",
    "monitor_server_port": 8080,
    "load_cloud_database": false, 
    "respond_to_all_messages" : false,
    "max_monitor_messages": 20, // max number of monitor messages to keep in context
    "proxyserver_port": 8081,
    "monitor_model" : {
        "api" : "doubao",
        "model": "doubao-1-5-pro-32k-250115"
    },
    
    // the base profile is shared by all bots for default prompts/examples/modes
    "base_profile": "./profiles/defaults/creative.json", // survival.json, creative.json, god_mode.json
    "profiles": [
        // "./lucy.json",
        "./max.json",
        // if you are using more than 1 profile, then 
        // - you can use /msg or @botname in order to talk to each bot indivually
        // - or you can use @all in order to talk to all the bots at the same time
        // individual profiles override values from the base profile
    ],
    "load_memory": false, // load memory from previous session
    "memory_bank_size": 20, // max number of facts to remember in memory bank
    "init_message": "Respond with hello world and your name", // sends to all on spawn
    "only_chat_with": [], // users that the bots listen to and send general messages to. if empty it will chat publicly
    "language": "en", // translate to/from this language. Supports these language names: https://cloud.google.com/translate/docs/languages
    "allow_insecure_coding": false, // allows newAction command and model can write/run code on your computer. enable at own risk
    "blocked_actions" : [], // commands to disable and remove from docs. Ex: ["!setMode"]
    // "blocked_actions" : ["!build", "!endBuild"],
    "code_timeout_mins": -1, // minutes code is allowed to run. -1 for no timeout
    "relevant_docs_count": 5, // number of relevant code function docs to select for prompting. -1 for all
    "max_messages": 15, // max number of messages to keep in context
    "num_examples": 2, // number of examples to give to the model
    "max_commands": -1, // max number of commands that can be used in consecutive responses. -1 for no limit
    "verbose_commands": true, // show full command syntax
    "narrate_behavior": true, // chat simple automatic actions ('Picking up item!')
    "chat_bot_messages": true, // publicly chat messages to other bots
    "stt_service_provider": "bytedance", // "openai" or "bytedance"
    "plugins" : ["Dance"], // plugin will be loaded if and only if it's name appears here
}

// these environment variables override certain settings
if (process.env.MINECRAFT_PORT) {
    settings.port = process.env.MINECRAFT_PORT;
}
if (process.env.MONITOR_SERVER_PORT) {
    settings.monitor_server_port = process.env.MONITOR_SERVER_PORT;
}
if (process.env.PROFILES && JSON.parse(process.env.PROFILES).length > 0) {
    settings.profiles = JSON.parse(process.env.PROFILES);
}

export default settings;