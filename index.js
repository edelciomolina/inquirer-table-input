const chalk = require("chalk");
const cliCursor = require("cli-cursor");
const inquirer = require("inquirer");
const Base = require("inquirer/lib/prompts/base");
const Choices = require("inquirer/lib/objects/choices");
const observe = require("inquirer/lib/utils/events");
const Paginator = require("inquirer/lib/utils/paginator");
const Table = require("cli-table");
const { map, takeUntil } = require("rxjs/operators");

class TableInput extends Base {
  /**
   * Initialise the prompt
   *
   * @param  {Object} questions
   * @param  {Object} rl
   * @param  {Object} answers
   */
  constructor(questions, rl, answers) {
    super(questions, rl, answers);

    this.opt.editKey = this.opt.editKey?.toLowerCase();
    this.opt.freezeColumns = this.opt.freezeColumns || 1;
    this.columns = new Choices(this.opt.columns, []);
    this.pointer = 0;
    this.horizontalPointer = this.opt.freezeColumns;
    this.rows = new Choices(this.opt.rows, []);
    this.values = this.columns.filter(() => true).map(() => undefined);

    this.pageSize = this.opt.pageSize || 5;
  }

  /**
   * Start the inquirer session
   *
   * @param  {Function} callback
   * @return {TablePrompt}
   */
  _run(callback) {
    this.done = callback;

    const events = observe(this.rl);
    const validation = this.handleSubmitEvents(
      events.line.pipe(map(this.getCurrentValue.bind(this)))
    );
    validation.success.forEach(this.onEnd.bind(this));
    validation.error.forEach(this.onError.bind(this));

    events.keypress.forEach(({ key }) => {
      if (!this.editingMode) {
        switch (key.name) {
          case "down":
            return this.onDownKey();

          case "up":
            return this.onUpKey();

          case "left":
            return this.onLeftKey();

          case "right":
            return this.onRightKey();

          case "escape":
            return this.render(chalk.green("Press ESC again to exit!"));

          default:
            this.onEditKey();
            this.onEditPress(key);
        }
      } else {
        return this.onEditPress(key);
      }
    });

    cliCursor.hide();
    this.render();

    return this;
  }

  getCurrentValue() {
    const currentValue = [];

    this.rows.forEach((row, rowIndex) => {
      currentValue.push(this.values[rowIndex]);
    });

    return currentValue;
  }

  onDownKey() {
    const length = this.rows.realLength;

    this.pointer = this.pointer < length - 1 ? this.pointer + 1 : this.pointer;
    this.render();
  }

  onEnd(state) {
    this.status = "answered";
    this.spaceKeyPressed = true;

    this.render();

    this.screen.done();
    cliCursor.show();
    this.done(state.value);
  }

  onError(state) {
    return this.onEditKey();
  }

  onLeftKey() {
    const length = this.columns.realLength - 1;

    this.horizontalPointer =
      this.horizontalPointer > this.opt.freezeColumns
        ? this.horizontalPointer - 1
        : length;
    this.render();
  }

  onRightKey() {
    const length = this.columns.realLength;

    this.horizontalPointer =
      this.horizontalPointer < length - 1
        ? this.horizontalPointer + 1
        : this.opt.freezeColumns;
    this.render();
  }

  onEditPress(key) {
    const mode = this.columns
      .get(this.horizontalPointer)
      .editable.toLowerCase();
    const isNumber = /^[0-9]$/.test(key.name);
    const isText = /^[a-zA-Z0-9\s]$/.test(key.name);
    const isDecimal = /^[0-9.]$/.test(key.name);

    // Exemplo: Adicione o caractere pressionado à sua escolha atual
    let value = this.rows.choices[this.pointer][this.horizontalPointer];

    if (this.firstTimeEditingMode) {
      this.valueBeforeEditing = value;
      this.firstTimeEditingMode = false;
      value = "";
    }

    switch (key.name) {
      case "escape": {
        this.rows.choices[this.pointer][
          this.horizontalPointer
        ] = this.valueBeforeEditing;
        this.render();
        return this.onEditKey();
      }
      case "backspace": {
        const value = this.rows.choices[this.pointer][this.horizontalPointer];
        if (value.length > 0) {
          this.rows.choices[this.pointer][this.horizontalPointer] = value.slice(
            0,
            -1
          );
          this.render();
        }
      }
      case this.opt.editKey: {
        return this.onEditKey();
      }
      default: {
        if (isNumber && mode === "number") {
          this.rows.choices[this.pointer][this.horizontalPointer] =
            value + key.name;
          this.render();
        }
        if (isText && mode === "text") {
          this.rows.choices[this.pointer][this.horizontalPointer] =
            value + key.name;
          this.render();
        }
        if (isDecimal && mode === "decimal") {
          this.rows.choices[this.pointer][this.horizontalPointer] =
            value + key.name;
          this.render();
        }

        return false;
      }
    }
  }

  onEditKey() {
    const isEditable = this.columns.get(this.horizontalPointer).editable;

    if (isEditable) {
      this.firstTimeEditingMode = true;
      this.editingMode = !this.editingMode;
      this.render();
    }
  }

  onSpaceKey() {
    const value = this.columns.get(this.horizontalPointer).value;

    this.values[this.pointer] = value;
    this.spaceKeyPressed = true;
    this.render();
  }

  onUpKey() {
    this.pointer = this.pointer > 0 ? this.pointer - 1 : this.pointer;
    this.render();
  }

  async inputAlert(message) {
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "inputValue",
        message: message
      }
    ]);
    return answers.inputValue;
  }

  paginate() {
    const middleOfPage = Math.floor(this.pageSize / 2);
    const firstIndex = Math.max(0, this.pointer - middleOfPage);
    const lastIndex = Math.min(
      firstIndex + this.pageSize - 1,
      this.rows.realLength - 1
    );
    const lastPageOffset = this.pageSize - 1 - lastIndex + firstIndex;

    return [Math.max(0, firstIndex - lastPageOffset), lastIndex];
  }

  render(message) {
    let content = this.getQuestion();
    let bottomContent = "";

    if (!this.spaceKeyPressed && this.opt.hideInfoKeysWhenKeyPressed) {
      content += this.opt.infoKeys;
    }

    const [firstIndex, lastIndex] = this.paginate();
    const table = new Table({
      head: this.columns.pluck("name").map(name => chalk.cyan.bold(name))
    });

    this.rows.forEach((row, rowIndex) => {
      if (rowIndex < firstIndex || rowIndex > lastIndex) return;

      const columnValues = [];

      this.columns.forEach((column, columnIndex) => {
        const editable =
          (column.editable &&
            column.editable.toString().toLowerCase() !== "none") ||
          false;

        const isSelected =
          this.pointer === rowIndex && this.horizontalPointer === columnIndex;

        // const value =
        //     column.value === this.values[rowIndex]
        //         ? figures.radioOn
        //         : figures.radioOff;

        const cellValue = this.rows.realChoices[rowIndex][columnIndex];

        const value = editable ? ` ${cellValue} ` : cellValue;

        if (this.editingMode) {
          columnValues.push(
            isSelected
              ? editable
                ? chalk.bgGreen.white.bold(value)
                : chalk.yellow(value)
              : value
          );
        } else {
          columnValues.push(
            isSelected
              ? editable
                ? chalk.bgYellowBright.whiteBright.bold(value)
                : chalk.yellow(value)
              : value
          );
        }
      });

      const chalkModifier =
        this.status !== "answered" && this.pointer === rowIndex
          ? chalk.reset.cyan
          : chalk.reset;

      table.push({
        [chalkModifier(row[0])]: columnValues.slice(1)
      });
    });

    content += "\n\n" + table.toString();

    if (message) {
      bottomContent = message;
    }

    this.screen.render(content, bottomContent);
  }
}

module.exports = TableInput;
