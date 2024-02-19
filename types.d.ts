declare module "@living-papers/compiler" {
  export function compile(
    inputFile: string,
    options: {

    },
  ): Promise<{
    elapsedTime: number,
    output: { [outputType: string]: string },
  }>;
}
