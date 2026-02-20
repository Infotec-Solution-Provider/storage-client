import { File } from "../../../../generated/prisma";

export type FileOutput = Omit<File, 'path'>;

export interface WriteFileOptions {
    file: Express.Multer.File;
    folder: string;
}

export interface ReadFileOptions {
    sourcePath: string;
}

abstract class Storage {
    abstract writeFile(options: WriteFileOptions): Promise<string>;
    abstract readFile(options: ReadFileOptions): Promise<NodeJS.ReadableStream>;
}

export default Storage;