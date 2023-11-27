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

    // private variables
    this.showInfo = true;
    this.columns = new Choices(this.opt.columns, []);
    this.pointer = 0;
    this.nextEscapeWillClose = false;

    // parameters
    this.opt.escapeMessage =
      this.opt.escapeMessage || chalk.red("Press ESC again to exit!");
    this.opt.confirmMessage =
      this.opt.confirmMessage || chalk.green("Press ENTER again to confirm!");
    this.opt.hideInfoWhenKeyPressed = this.opt.hideInfoWhenKeyPressed || false;
    this.opt.infoMessage = this.opt.infoMessage || "";
    this.opt.decimalPoint = this.opt.decimalPoint || ".";
    this.opt.decimalPlaces = this.opt.decimalPlaces || 2;
    this.opt.freezeColumns = this.opt.freezeColumns || 0;
    this.selectedColor = this.opt.selectedColor || chalk.yellow;
    this.editableColor = this.opt.editableColor || chalk.bgYellow;
    this.editingColor = this.opt.editingColor || chalk.bgBlue;
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
      if (this.opt.hideInfoWhenKeyPressed) this.showInfo = false;
      if (key.name !== "escape") this.nextEscapeWillClose = false;
      this.nextEnterWillConfirm = false;

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
            if (!this.nextEscapeWillClose) {
              this.nextEscapeWillClose = true;
              return this.render(this.opt.escapeMessage);
            } else {
              this.render();
              return this.onEnd(false);
            }

          default:
            if (this.columns.get(this.horizontalPointer).editable) {
              this.updateEditing();
              this.onEditPress(key);
            }
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
    this.screen.done();
    cliCursor.show();

    if (state) {
      return this.done({
        state,
        result: this.rows.choices.map(row => {
          const rowData = {};
          this.columns.choices.forEach((column, index) => {
            rowData[column.value] = row[index]
              .toString()
              .replace(/\u001b\[[0-9;]*m/g, "");
          });
          return rowData;
        })
      });
    } else {
      return this.done({
        state
      });
    }
  }

  formatCell() {
    if (this.editingType === "number") {
      this.rows.choices[this.pointer][this.horizontalPointer] = parseInt(
        this.rows.choices[this.pointer][this.horizontalPointer] || 0
      );
    }

    if (this.editingType === "decimal") {
      this.rows.choices[this.pointer][this.horizontalPointer] = parseFloat(
        this.rows.choices[this.pointer][this.horizontalPointer] || 0
      ).toFixed(this.opt.decimalPlaces);
    }
  }

  onError(state) {
    if (this.editingMode) {
      this.editingMode = false;
      this.formatCell();
      this.render();
    } else {
      if (!this.nextEnterWillConfirm) {
        this.nextEnterWillConfirm = true;
        return this.render(this.opt.confirmMessage);
      } else {
        this.render();
        return this.onEnd(true);
      }
    }
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
    this.editingType = this.columns
      .get(this.horizontalPointer)
      .editable.toLowerCase();
    this.isNumber = /^[0-9]$/.test(key.name);
    this.isText = /^[a-zA-Z0-9\s]$/.test(key.sequence);
    this.isDecimal = /^[0-9\,\.]$/.test(key.sequence);

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
        return this.updateEditing();
      }
      case "delete": {
        this.rows.choices[this.pointer][this.horizontalPointer] = "";
        this.formatCell();
        return this.updateEditing();
      }
      case "backspace": {
        let value = this.rows.choices[this.pointer][
          this.horizontalPointer
        ].toString();
        this.rows.choices[this.pointer][this.horizontalPointer] = value.slice(
          0,
          -1
        );

        value = this.rows.choices[this.pointer][
          this.horizontalPointer
        ].toString();
        if (value.length === 0) {
          this.formatCell();
          this.updateEditing();
        }

        this.render();
      }
      default: {
        if (this.isNumber && this.editingType === "number") {
          this.rows.choices[this.pointer][this.horizontalPointer] =
            value + key.name;
          this.render();
        }

        if (this.isText && this.editingType === "text") {
          this.rows.choices[this.pointer][this.horizontalPointer] =
            value + key.sequence;
          this.render();
        }
        if (this.isDecimal && this.editingType === "decimal") {
          const existDecimalPoint =
            value.indexOf(".") >= 0 || value.indexOf(",") >= 0;
          const decimalPointPressed =
            key.sequence.indexOf(".") >= 0 || key.sequence.indexOf(",") >= 0;

          const keyAccepted =
            !decimalPointPressed || (!existDecimalPoint && decimalPointPressed);

          if (keyAccepted) {
            this.rows.choices[this.pointer][this.horizontalPointer] =
              value +
              key.sequence
                .replace(".", this.opt.decimalPoint)
                .replace(",", this.opt.decimalPoint);

            this.render();
          }
        }

        return false;
      }
    }
  }

  updateEditing() {
    const isEditable = this.columns.get(this.horizontalPointer).editable;

    if (isEditable) {
      this.firstTimeEditingMode = true;
      this.editingMode = !this.editingMode;
      this.render();
    }
  }

  onUpKey() {
    this.pointer = this.pointer > 0 ? this.pointer - 1 : this.pointer;
    this.render();
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

    if (this.showInfo) {
      content += this.opt.infoMessage;
    }

    const [firstIndex, lastIndex] = this.paginate();
    const table = new Table({
      head: this.columns.pluck("name").map(name => name)
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

        const cellValue = this.rows.realChoices[rowIndex][columnIndex];

        const value = editable ? ` ${cellValue} ` : cellValue;

        if (this.editingMode) {
          columnValues.push(
            isSelected
              ? editable
                ? this.editingColor(value)
                : this.selectedColor(value)
              : value
          );
        } else {
          columnValues.push(
            isSelected
              ? editable
                ? this.editableColor(value)
                : this.selectedColor(value)
              : value
          );
        }
      });

      table.push(columnValues);
    });

    content += "\n\n" + table.toString();

    if (message) {
      bottomContent = message;
    }

    this.screen.render(content, bottomContent);
  }
}

module.exports = TableInput;
