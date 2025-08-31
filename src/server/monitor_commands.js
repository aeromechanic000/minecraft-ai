
export const commands = [
    {
        "name" : "!overviewOfBots",
        "description" : "return a summary of the overall status of all the bots. ",
        "params" : {},
        "perform" : async (agents) => {
            console.log("Performing action: !overviewOfBots")
        },
    },
    // {
    //     "name" : "name",
    //     "description" : "description",
    //     "params" : {
    //         "type" : "string",
    //         "description" : "description",
    //     },
    // },
]

export function getCommandDocs(messages, query) {
    const typeTranslations = {
        'float':        'number',
        'int':          'number',
        'BlockName':    'string',
        'ItemName':     'string',
        'boolean':      'bool'
    }

    let docs = "";
    if (commands.length > 0) {
        for (let command of commands) {
            docs += '\n' + command.name + ': ' + command.description;
            docs += '\n\tParams:';
            if (command.params && Object.keys(command.params).length > 0) {
                for (let param in command.params) {
                    docs += `\n- ${param}: (${typeTranslations[command.params[param].type]??command.params[param].type}) ${command.params[param].description}`;
                }
            } else {
                docs += ' No parameters required.';
            }
        }
    } else {
        docs = "No available commands. You can only response in text."
    }
    return docs
}