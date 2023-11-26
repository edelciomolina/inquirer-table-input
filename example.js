const chalk = require("chalk");
const inquirer = require("inquirer");
const TableInput = require("./index.js");

inquirer.registerPrompt("table-input", TableInput);

inquirer
  .prompt([
    {
      type: "table-input",
      name: "edit-pricing",
      message: "PRICING",
      //editKey: 'f2',
      infoKeys: `\n- Use ARROWS to move cells\n- Type into ${chalk.bgYellow.bold(
        " Yellow "
      )} fields to edit.\n- Press ENTER to confirm.\n- Press ESC to cancel.`,
      hideInfoKeysWhenKeyPressed: true,
      freezeColumns: 0,
      columns: [
        { name: "NF Number", value: "nf" },
        { name: "Customer", value: "customer" },
        { name: "Quantity", value: "quantity", editable: "number" },
        { name: "Pricing", value: "pricing", editable: "decimal" }
      ],
      rows: [
        ["8288", "Shinji Masumoto", 1, 68.03],
        ["8289", "João da Silva", 4, 125.85]
      ],
      validate: () => false
    }
  ])
  .then(answers => {
    console.log(answers);
  });
