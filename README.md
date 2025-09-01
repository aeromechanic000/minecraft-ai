# <img src="https://s2.loli.net/2025/04/18/RWaFJkY4gSDLViy.png" alt="Minecraft AI" width="36" height="36"> Minecraft AI : Toward Embodied Turing Test

Minecraft AI explores how AI Characters (AICs) can become creative, expressive, and socially responsive agents inside Minecraft. More than just NPCs, these agents can dance, sing, build, and chat—reacting to the world and to players with surprising depth and personality. By combining large language models with an open-ended sandbox environment, this project reimagines Minecraft as a playground for human–AI co-creation.

**The Embodied Turing Test** rather than asking "Can machines think?", Minecraft AI invites a new question for the generative AI era: Can machines play with us? Through open-ended interaction, emergent behaviors, and shared creativity, we explore whether AI can truly engage as a companion—not just in conversation, but in fun, imagination, and collaborative world-building.

**Minecraft AI** is a project derived from [MINDcraft](https://github.com/kolbytn/mindcraft), building upon the foundational ideas of [Generative Agents](https://github.com/joonspk-research/generative_agents)—including autonomous planning, self-reflection, self-motivated behavior, and long-term goal pursuit—within an interactive Minecraft environment. Instead of creating a new memory system from scratch, the project refactors and extends Mindcraft’s original memory infrastructure, introducing dynamic agent profiles, daily self-generated task lists, and reflective behavior cycles. These enhancements allow agents to interact, plan, and adapt over time based on their experiences and identity, resulting in a lightweight yet compelling simulation of human-like cognition and social dynamics.

🐲 For those who are interested in building Minecraft AICs with Python, check out [Minecraft AI-Python](https://github.com/aeromechanic000/minecraft-ai-python).

More detailed information can be found in [Minecraft AI Whitepapers and Technical Reports](https://github.com/aeromechanic000/minecraft-ai-whitepaper).

- [Minecraft AI: Toward Embodied Turing Test Through AI Characters](https://github.com/aeromechanic000/minecraft-ai-whitepaper/blob/main/whitepapers/minecraft_ai_whitepaper-toward_embodied_turing_test_through_ai_characters.pdf)

🧜 **Meet Max**, our new AI assistant for the Minecraft AI community! Ask questions, get started with AIC profiles, or explore tutorials — Max@MinecraftAI ([Intl.](https://www.coze.com/s/ZmFp9aCtM/)/[CN](https://doubao.com/bot/8dV6HrwV)) is here to help.

⚒️ This project is currently in development. We are continuously adding and optimizing more functions. If you have any questions, you're welcome to join our Discord server for further discussions!

<a href="https://discord.gg/RKjspnTBmb" target="_blank"><img src="https://s2.loli.net/2025/04/18/CEjdFuZYA4pKsQD.png" alt="Official Discord Server" width="180" height="36"></a>

---

## Tutorials 

<table>
<tr>
<td><a href="https://www.youtube.com/watch?v=c3687wMx5ek" target="_blank"><img src="https://s2.loli.net/2025/09/01/u3LiqweSpaMX9Ky.png" alt="Get Started with Minecraft AI" width="250" height="150"></a></td>
<td><a href="ttps://www.youtube.com/watch?v=jzfPk23PE_o" target="_blank"><img src="https://s2.loli.net/2025/09/01/V5hzKIsJN7FCDfp.png" alt="More Actions with Plugins" width="250" height="150"></a></td>
<td><a href="https://www.youtube.com/watch?v=8OrhXD2hjXA" target="_blank"><img src="https://s2.loli.net/2025/09/01/DCmG89E4urYU57L.png" alt="Monitor & Cloud Knowledge" width="250" height="150"></a></td>
</tr>
</table>

---

## Showcases 

<table>
<tr>
<td><a href="https://www.youtube.com/watch?v=6o0S_hf7uh8" target="_blank"><img src="https://s2.loli.net/2025/09/01/RzP3TCAISHl54BQ.png" alt="Survive Togetherin Minecraft with AI Companions" width="250" height="150"></a></td>
<td><a href="https://www.youtube.com/watch?v=RKJ3V1xiQGo" target="_blank"><img src="https://s2.loli.net/2025/09/01/4xYreNLyKO3VWoI.png" alt="Minecraft Characters with Topic-Fact Memory" width="250" height="150"></a></td>
<td><a href="https://www.youtube.com/watch?v=ESXGo489c5s" target="_blank"><img src="https://s2.loli.net/2025/09/01/5w2BNSG6u9zoaDh.png" alt="Create Original Characters with Minecraft AI-Python" width="250" height="150"></a></td>
</tr>
<tr>
<td><a href="https://www.youtube.com/watch?v=LauwH7enj5A" target="_blank"><img src="https://s2.loli.net/2025/05/05/tK8rigzhcU4d6jA.png" alt="How AI Characters Build Better in Minecraft" width="250" height="150"></a></td>
<td><a href="https://www.youtube.com/watch?v=lI5VubK_eHs" target="_blank"><img src="https://s2.loli.net/2025/05/01/KcO4AXGhmwH7Z2v.png" alt="Minecraft Meets AI Dance Party" width="250" height="150"></a></td>
<td><a href="https://www.youtube.com/watch?v=xGs_TPBtwKw" target="_blank"><img src="https://s2.loli.net/2025/05/01/kLC1UuOHpgtTjs7.png" alt="Emergent Behavior of Minecraft AIC" width="250" height="150"></a></td>
</tr>
</table>

---

## How to Contribute  

We wholeheartedly welcome you to contribute to the Minecraft AI project! Your contributions play a crucial role in shaping this project into a robust and versatile platform for the community.

### Submitting Code via Pull Requests (PRs)
The primary way to contribute code is through Pull Requests. When creating a PR, please adhere to the general best practices for PRs. Keep each PR focused on a specific issue or feature, and limit the scope of changes to a manageable size. This approach facilitates a smoother review process and enables quicker merging of your contributions. It ensures that our reviewers can thoroughly assess the changes without being overwhelmed by excessive code modifications.

### Code Structure and Compatibility Policies
Our goal is to establish Minecraft AI as a foundational platform in the community, empowering users to build innovative projects and drive the development of intelligent and engaging AI characters within the game. To achieve this, we have specific policies regarding the codebase:

- **Core and Underlying Code:** For the core implementation and underlying code, as well as the environment setup, we aim to maintain simplicity and focus on essential, indispensable features. Only changes that clearly enhance the performance across all scenarios and address bugs or deficiencies in the underlying code will be considered for merge after careful review.
- **Optional Features as Plugins:** Any features that are not universally applicable to all scenarios, especially those that can be optionally enabled or disabled at runtime, should be implemented as plugins. Before submitting a plugin, please ensure that it has been thoroughly tested to guarantee its proper functionality. Additionally, refrain from modifying any files outside the plugin's scope, including presetting the plugin's default configuration in the settings. Each plugin should include a README file that clearly outlines how to enable the plugin and any additional parameters required in the bot profile or other relevant areas to ensure optimal performance.

## Community Engagement and Alternative Contribution Methods
We encourage active communication within the community. If you encounter any issues or have ideas for improvements, feel free to discuss them with us first. We also support alternative ways of contributing, such as forking the repository or creating a separate repository for your plugins. Even if you choose not to submit your plugins to our main code repository, we are more than happy to collaborate and help promote third-party plugins through the Minecraft AI community, ensuring that all players can enjoy a richer gaming experience with enhanced features.
We look forward to your valuable contributions and the exciting possibilities they bring to the Minecraft AI project!

---

## Quick Start 

The setup process of **Minecraft AI** is nearly identical to that of [MINDcraft](https://github.com/kolbytn/mindcraft), with additional features and flexibility for configuring AI character behavior.

### 1. Clone the Repository

Clone this repository into your working directory:

```bash
git clone https://github.com/aeromechanic000/minecraft-ai.git
cd minecraft-ai
```

Make sure you're in the `minecraft-ai` directory before continuing.

### 2. Install Prerequisites

#### 2.1 Install Node Modules

From the root of the `minecraft-ai` directory, install the required Node.js packages:

```bash
npm install
```

This will install all dependencies into the `node_modules` directory.

> 💡 **Note on Patches**
> If you plan to apply patches (e.g., from the `/patches` directory), first make your changes to the local dependency, then run:
>
> ```bash
> npx patch-package [package-name]
> ```
>
> These patches will be automatically re-applied on every `npm install`.

💁‍♂️ **Common Setup Issues**

Some devices may not support the latest `Node.js` version. If you see installation errors due to incompatible packages:

* Consider switching to Node.js **v18**, which is broadly compatible.
* Use a tool like [`nvm`](https://github.com/nvm-sh/nvm) (Linux/macOS) or [`nvm-windows`](https://github.com/coreybutler/nvm-windows) to manage multiple Node.js versions.

If individual packages fail to install, you can try:

* Installing them manually:

  ```bash
  npm install [package-name]
  ```
* Or using a pre-downloaded package: see [Use a Local Node Package](./tutorials/use_a_local_node_package.md)

#### 2.2 Install Minecraft Client

1. Download and install [Minecraft Launcher](https://www.minecraft.net/en-us/about-minecraft).
2. Minecraft AI supports **Minecraft Java Edition up to version 1.21.1**.
3. Launch Minecraft, create a world in the supported version, and open it to LAN (e.g., port `55916`).

### 3. Configure `settings.js`

Edit `settings.json` with the correct game connection settings:

```js
"minecraft_version": "1.21.1",
"host": "127.0.0.1",
"port": 55916,
"auth": "offline"
```

* `minecraft_version`: match your client version
* `host`: usually `localhost` or your machine’s IP
* `port`: must match the LAN world port

### 4. Create and Configure Bot Profiles

A bot profile defines an AI character's name, personality, and backend model. Set the profiles to activate in `settings.json`:

```js
"profiles": ["./max.json"]
```

Here’s a minimal example of `max.json`:

```json
{
  "name": "Max",
  "person_desc": "You are a smart Minecraft agent following your own heart...",
  "longterm_thinking": "I aim to become a reliable builder and problem-solver...",
  "model": {
    "api": "ollama",
    "model": "llama3.2"
  }
}
```

> 🔍 Explore more sample profiles in the `profiles/` directory.

### 5. Configure AI Model Access

To supply API keys for LLM backends:

1. Make a copy of `keys.example.json`, and rename the copy to `keys.json`
2. Fill in your API keys for the models you want to use:

```json
{
  "OPENAI_API_KEY": "",
  "GEMINI_API_KEY": "",
  ...
}
```

> 🔐 **Best Practice**: Use [environment variables](./tutorials/set_an_api_key_as_an_environment_variable.md) instead of hardcoding keys. If a key in `keys.json` is blank, Minecraft AI will automatically attempt to read it from your environment variables. For example, if you set `OPENAI_API_KEY = [your_openai_api_key]` as an environment variable, then it will be applied when `OPENAI_API_KEY` is not given a valid key in `keys.json`. 

Then configure the desired model in the `model` section of the bot profile:

```json
"model": {
  "api": "openai",
  "model": "gpt-4o"
}
```

✅ A full list of supported APIs and models is available in the table below.

<table>
<tr>
    <td> <b>API</b> </td> 
    <td> <b>Key</b> </td> 
    <td> <b>Model</b> </td>
    <td> <b>Example</b> </td>
</tr>
<tr>
    <td> openai </td>
    <td> OPENAI_API_KEY </td>
    <td> gpt-4.1, gpt-4o <br> <a href="https://platform.openai.com/docs/models">full list of models</a> </td>
    <td> "model" : {"api" : "openai", "model" : "gpt-4o"} </td>
</tr>
<tr>
    <td> google </td>
    <td> GEMINI_API_KEY </td>
    <td> gemini-2.5-flash-preview-05-20 <br> <a href="https://ai.google.dev/gemini-api/docs/models">full list of models</a> </td>
    <td> "model" : {"api" : "google", "model" : "gemini-2.5-flash-preview-05-20"} </td>
</tr>
<tr>
    <td> anthropic </td>
    <td> ANTHROPIC_API_KEY </td>
    <td> claude-opus-4-20250514 <br> <a href="https://docs.anthropic.com/en/docs/about-claude/models/overview">full list of models</a> </td>
    <td> "model" : {"api" : "anthropic", "model" : "claude-opus-4-20250514"} </td>
</tr>
<tr>
    <td> deepseek </td>
    <td> DEEPSEEK_API_KEY </td>
    <td> deepseek-chat, deepseek-reasoner <br> <a href="https://api-docs.deepseek.com/quick_start/pricing">full list of models</a> </td>
    <td> "model" : {"api" : "deepseek", "model" : "deepseek-chat"} </td>
</tr>
<tr>
    <td> xai </td>
    <td> XAI_API_KEY </td>
    <td> grok-3, grok-3-mini <br> <a href="https://docs.x.ai/docs/models">full list of models</a> </td>
    <td> "model" : {"api" : "xai", "model" : "grok-3"} </td>
</tr>
<tr>
    <td> doubao </td>
    <td> DOUBAO_API_KEY </td>
    <td> doubao-1-5-pro-32k-250115 <br> <a href="https://www.volcengine.com/docs/82379/1330310">full list of models</a> </td>
    <td> "model" : {"api" : "doubao", "model" : "doubao-1-5-pro-32k-250115"} </td>
</tr>
<tr>
    <td> qwen </td>
    <td> QWEN_API_KEY </td>
    <td> qwen-max, qwen-plus <br> <a href="https://help.aliyun.com/zh/model-studio/getting-started/models">full list of models</a> </td>
    <td> "model" : {"api" : "qwen", "model" : "qwen-max"} </td>
</tr>
<tr>
    <td> mistral </td>
    <td> MISTRAL_API_KEY </td>
    <td> mistral-large-latest <br> <a href="https://docs.mistral.ai/getting-started/models/models_overview/">full list of models</a> </td>
    <td> "model" : {"api" : "mistral", "model" : "mistral-large-latest"} </td>
</tr>
<tr>
    <td> <a href="https://pollinations.ai/">pollinations</a> </td>
    <td> <b>NOT REQUIRED</b> </td>
    <td> openai-large, gemini, deepseek <br> <a href="https://text.pollinations.ai/models">full list of models</a> </td>
    <td> "model" : {"api" : "pollinations", "model" : "openai-large"}</td>
</tr>
<tr>
    <td> <a href="https://ollama.com/">ollama</a> </td>
    <td> <b>NOT REQUIRED</b> </td>
    <td> llama3.2, llama3.1 <br> <a href="https://ollama.com/library">full list of models</a> </td>
    <td> "model" : {"api" : "ollama", "model" : "llama3.2"}</td>
</tr>
<tr>
    <td> openrouter </td>
    <td> OPENROUTER_API_KEY </td>
    <td> deepseek/deepseek-chat-v3-0324:free <br> <a href="https://openrouter.ai/models">full list of models</a> </td>
    <td> "model" : {"api" : "openrouter", "model" : "deepseek/deepseek-chat-v3-0324:free"} </td>
</tr>
<tr>
    <td> huggingface </td>
    <td> HUGGINGFACE_API_KEY </td>
    <td> huggingface/mistralai/Mistral-Nemo-Instruct-2407 <br> <a href="https://huggingface.co/models">full list of models</a> </td>
    <td> "model" : {"api" : "huggingface", "model" : "mistralai/Mistral-Nemo-Instruct-2407"} </td>
</tr>
<tr>
    <td> replicate </td>
    <td> REPLICATE_API_KEY </td>
    <td> meta/meta-llama-3-70b-instruct <br> <a href="https://replicate.com/collections/language-models">full list of models</a> </td>
    <td> "model" : {"api" : "replicate", "model" : "meta/meta-llama-3-70b-instruct"} </td>
</tr>
</table>

🧛‍♀️ *You can also use Deepseek models through the "doubao" API.*

---

### 6. Start the Game

To launch the AI agent:

```bash
node main.js
```

If everything is set up correctly, your AI character will join the game and greet you. Now you can start to play with the AICs, e.g. [talking to them](./tutorials/talk_to_aics.md).

### Common Errors

#### `ECONNRESET` (Code `-4077`)

This usually means your `minecraft_version` setting does not match the running game. Double-check that you are using:

* Minecraft Java Edition version `1.21.1`
* And the corresponding value in `settings.json`:

```json
"minecraft_version": "1.21.1"
```

#### `keys.json` not found 

Even if you’ve provided all required keys via environment variables, the minecraft-ai project still expects a file named keys.json to exist in the root directory.

If the file appears to be present but you're still seeing a "keys.json not found" error, double-check its actual filename.
In some cases, especially on Windows or macOS, your file may be accidentally saved as keys.json.txt or with another hidden extension. File explorers often hide these by default.

👉 To fix this, make sure the file is named exactly keys.json — no hidden extensions, no extra suffixes.

---

## Documentations 

Want to see how it all works? Check out the [Tutorials](https://github.com/aeromechanic000/minecraft-ai/tree/main/tutorials) for more detailed usage guides and examples.

---

## Notable Features

- [Extension with Plugins](#extension-with-plugins) 
- [Multimodal Interaction](#multimodal-interaction)
- [Memory Module](#memory-module)

### Support for Plugins

We added a module, `PluginManager` (`src/agent/plugin.js`), which enables dynamic loading of modular agent plugins. It searches the `src/plugins` directory and loads plugins based on the current configuration. With plugins, we can extend the available actions dynamically, which reduce the pressure for putting long `COMMAND_DOCS` into the always limited LLM context. 

#### Plugin Structure

Each plugin should reside in its own subdirectory under `src/plugins`. The name of the directory will be used as the plugin’s identifier. For example, the folder `src/plugins/Dance/` corresponds to a plugin named "Dance".

A valid plugin must include a main.js file that exports a PluginInstance class. When the PluginManager loads the plugin, it instantiates this class and calls its `init()` method for initialization.

In addition, the PluginInstance must implement a method called getPluginActions(), which returns a list of action definitions. These actions will be appended to the global action list in `src/agent/commands/actions.js`.

You can refer to src/plugins/Dance for an example implementation.

#### Enabling Plugins

Plugins are only loaded if their names are explicitly listed in the `settings.plugins` array. If the plugin name is not included, it will be ignored.

*Notice:* The `VisionInterpreter` and `NPC` modules of MINDcraft have been converted into plugins in Minecraft AI, which means you should put their names in `plugins` section of `settings.json` to enable them.

<table>
<tr>
    <td><img src="https://s2.loli.net/2025/05/01/BNLAIKhpsiC5naU.gif" alt="AIC dance with the example Dance plugin." width="380" height="220"></td>
    <td><img src="https://s2.loli.net/2025/04/20/wWpoAE9xe6rcQ7f.gif" alt="AIC build a igloo after self-driven thinking." width="380" height="220"></td>
</tr>
</table>

### Multimodal Interaction

#### Talk to The AI Character (Bot)

In Mindcraft, you can manage the bots through a page hosted at `localhost:8080` (by default). We have added a Speech-to-Text (STT) function to this page. By clicking the "Start Detecting" button, the front-end will request access to your microphone and continuously detect voice input. When voice is detected, it starts recording and stops when there is no voice for 3 seconds. You can also manually stop the recording and detection by clicking the "Stop Detecting" button.

The recorded voice is converted into text via the STT API. If the resulting text starts with the name of a specific bot, the text will be sent to that bot as a whisper message. Otherwise, an "@all" label will be automatically added, ensuring that the message is received by all bots.

🪪 **Currently, the STT function is only available with [ByteDance's STT API](https://www.volcengine.com/docs/6561/163043). Therefore, you need to apply for access rights on ByteDance's website, enable the STT service, obtain the appropriate app ID and access token, and fill them in the `key.json` file:**

```json
"BYTEDANCE_APP_ID": "[app ID]",
"BYTEDANCE_APP_TOKEN": "[access token]"
```

<table>
<tr>
    <td><img src="https://s2.loli.net/2025/04/18/FVON4CPf3DTSpQ8.gif" alt="Talk to bot." width="400" height="220"></td>
</tr>
</table>

#### Bot Speak

In Minecraft AI, the speak function is implemented as a plugin. Therefore, to enable the speak function, you need to include "Speak" in the `plugins` of `settings.json` file. Futhermore, you have to set field "speak" to "true" in the bot's profile. It uses the native text-to-speech (TTS) tools of your system. We have added an additional option to perform TTS via an API.

🪪 **Currently, the TTS via API function is only available with [ByteDance's TTS API](https://www.volcengine.com/docs/6561/79820). Therefore, you need to apply for access rights on ByteDance's website, enable the TTS service, obtain the appropriate app ID and access token, and fill them in the `key.json` file:**

```json
"BYTEDANCE_APP_ID": "[app ID]",
"BYTEDANCE_APP_TOKEN": "[access token]"
```

To use the TTS via API function, you need to set "speak" to `true` in the `settings.json` file and explicitly specify the "tts_voice_type" in the bot's profile. When using ByteDance's TTS service, only two voice types are available by default (others require additional purchase): `BV001_streaming` (female voice) and `BV002_streaming` (male voice). If "tts_voice_type" is not specified, the Mindcraft TTS process will be used instead.

```json
{
    "name": "Max", 
    "model": {
        "api": "doubao", 
        "model": "doubao-1-5-pro-32k-250115"
    },
    "speak" : true,
    "tts_voice_type": "BV002_streaming"
}
```

### Memory Module

The memory module has been modularized (in `src/agent/memory.js`)and refactored to support flexible memory management while maintaining compatibility with the original Mindcraft memory interface.

This new structure enables the agent to handle the stuff about memory management without touching other parts of the framework, and provides a solid foundation for experimenting with more advanced, "consciousness-like" memory models.

---

## Citation

```
@misc{minecraft_ai_2025,
    author = {Minecraft AI},
    title = {Minecraft AI: Toward Embodied Turing Test Through AI Characters},
    year = {2025},
    url={https://github.com/aeromechanic000/minecraft-ai-whitepaper}
}
```
